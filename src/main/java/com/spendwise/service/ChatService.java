package com.spendwise.service;

import com.spendwise.dto.ChatDtos.*;
import com.spendwise.service.ChatKnowledgeService.Entry;
import com.spendwise.service.ChatKnowledgeService.Match;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

/**
 * Answer pipeline (the knowledge base always speaks first, the LLM then refines it):
 *  1. Retrieve the best knowledge-base entries for the question; the top one is the DRAFT answer.
 *  2. The LLM gets the question + the draft + the other retrieved entries. It polishes the draft into a direct
 *     answer, and if the draft is wrong for this question (keyword matching can misfire) it corrects it using
 *     the retrieved data instead.
 *  3. LLM unavailable / rate limited / failed -> the raw draft is returned (or the generic fallback if there is none).
 * Pure greetings / thanks / goodbyes skip the LLM since there is nothing to refine.
 */
@Service
public class ChatService {
  private static final Logger log = LoggerFactory.getLogger(ChatService.class);
  private static final int MAX_MESSAGE_CHARS = 500;
  private static final int CONTEXT_ENTRIES = 3;
  /** Score at/above which a KB entry is treated as THE answer. */
  private static final int CONFIDENT_SCORE = 4;
  /** Very short messages ("hi", "thanks", "what is emi") are confident at a lower score. */
  private static final int SHORT_MESSAGE_SCORE = 2;
  private static final int SHORT_MESSAGE_TOKENS = 3;
  /** Long questions often mix several topics, so one keyword hit is not enough to pick a canned answer. */
  private static final int LONG_MESSAGE_TOKENS = 8;
  private static final int LONG_MESSAGE_SCORE = 6;

  private static final Set<String> SMALL_TALK = Set.of("greeting", "thanks", "bye");

  private final ChatKnowledgeService kb;
  private final String apiKey;
  private final String model;
  private final int aiPerIpPerHour;
  private final WebClient webClient = WebClient.builder().baseUrl("https://openrouter.ai/api/v1").build();
  private final Map<String, Deque<Long>> aiCalls = new ConcurrentHashMap<>();

  public ChatService(ChatKnowledgeService kb,
                     @Value("${app.openrouter.api-key}") String apiKey,
                     @Value("${app.openrouter.model}") String model,
                     @Value("${app.limits.chat-ai-per-ip-hour:20}") int aiPerIpPerHour) {
    this.kb = kb; this.apiKey = apiKey; this.model = model; this.aiPerIpPerHour = aiPerIpPerHour;
  }

  public ChatResponse reply(ChatRequest req, String clientIp) {
    String message = req.message() == null ? "" : req.message().trim();
    if (message.length() > MAX_MESSAGE_CHARS) message = message.substring(0, MAX_MESSAGE_CHARS);
    String norm = ChatKnowledgeService.norm(message);
    boolean hinglish = ChatKnowledgeService.isHinglish(norm);

    List<Match> ranked = kb.rank(message);
    Match best = ranked.isEmpty() ? null : ranked.get(0);
    boolean confident = best != null && isConfident(best, norm);

    // pure small talk: the KB answer is already perfect, nothing to refine
    if (confident && SMALL_TALK.contains(best.entry().id())) return fromEntry(best.entry(), hinglish, "kb");

    // 1) draft from the knowledge base  ->  2) LLM refines / corrects it
    if (apiKey != null && !apiKey.isBlank() && allowAi(clientIp)) {
      Entry draft = best == null ? null : best.entry();
      String text = askLlm(message, req.history(), draft, contextFor(ranked), hinglish);
      if (text != null) {
        // buttons / follow-up chips belong to the draft, so only reuse them when the draft was a confident match
        List<Map<String, Object>> actions = confident ? orEmpty(draft.act()) : List.of();
        List<String> next = confident && draft.next() != null ? draft.next() : kb.fallback().next();
        return new ChatResponse(text, draft == null ? null : draft.id(), actions, next, "ai");
      }
    }

    // 3) no LLM: the raw KB draft is still better than nothing
    if (best != null && best.score() >= SHORT_MESSAGE_SCORE) return fromEntry(best.entry(), hinglish, "kb");
    var fb = kb.fallback();
    return new ChatResponse(hinglish && fb.hi() != null ? fb.hi() : fb.a(), null, List.of(), fb.next(), "fallback");
  }

  private static boolean isConfident(Match m, String norm) {
    int n = ChatKnowledgeService.tokens(norm).size();
    if (m.score() >= SHORT_MESSAGE_SCORE && n <= SHORT_MESSAGE_TOKENS) return true;
    if (n > LONG_MESSAGE_TOKENS) return m.score() >= LONG_MESSAGE_SCORE;
    return m.score() >= CONFIDENT_SCORE;
  }

  private static ChatResponse fromEntry(Entry e, boolean hinglish, String source) {
    String text = (hinglish && e.hi() != null && !e.hi().isBlank()) ? e.hi() : e.a();
    return new ChatResponse(text, e.id(), orEmpty(e.act()), e.next() == null ? List.of() : e.next(), source);
  }

  private static <T> List<T> orEmpty(List<T> l) { return l == null ? List.of() : l; }

  private List<Entry> contextFor(List<Match> ranked) {
    List<Entry> ctx = new ArrayList<>();
    for (Match m : ranked) {
      if (ctx.size() >= CONTEXT_ENTRIES) break;
      if (SMALL_TALK.contains(m.entry().id())) continue;
      ctx.add(m.entry());
    }
    if (ctx.isEmpty()) { // nothing matched: give the model the project overview so it can still orient the user
      for (String id : List.of("about", "capabilities", "how-it-works")) kb.byId(id).ifPresent(ctx::add);
    }
    return ctx;
  }

  private boolean allowAi(String ip) {
    long now = System.currentTimeMillis(), cutoff = now - 3_600_000L;
    Deque<Long> q = aiCalls.computeIfAbsent(ip == null ? "unknown" : ip, k -> new ArrayDeque<>());
    synchronized (q) {
      while (!q.isEmpty() && q.peekFirst() < cutoff) q.pollFirst();
      if (q.size() >= aiPerIpPerHour) { log.warn("[Chat] AI rate limit hit for {}", ip); return false; }
      q.addLast(now);
      return true;
    }
  }

  private String askLlm(String message, List<Turn> history, Entry draft, List<Entry> context, boolean hinglish) {
    StringBuilder ref = new StringBuilder();
    for (Entry e : context) ref.append("## ").append(e.id()).append('\n').append(e.a()).append("\n\n");
    String draftText = draft == null ? "(none: nothing in the knowledge base matched this question)" : draft.a();

    String system = """
You are the Worthwise Assistant, the help bot inside Worthwise, a personal purchase decision engine that gives BUY / WAIT / SKIP verdicts.

How you work: a keyword search over the Worthwise knowledge base produced a DRAFT ANSWER for the user's question. Keyword search can pick the wrong entry, so you must check it.
1. If the DRAFT answers the question: refine it. Make it a direct, natural reply to exactly what the user asked, dropping parts that are not relevant.
2. If the DRAFT is wrong or only partly relevant: ignore the wrong part and write the correct answer from the REFERENCE entries.
3. If neither covers the question: say you are not sure and suggest what you can help with (analyzing a purchase, goals, profile, dashboard, account).
Rules:
- Never invent features, screens, prices or numbers that are not in the DRAFT or REFERENCE.
- Questions unrelated to Worthwise or personal spending decisions: politely say you can only help with Worthwise.
- No investment, tax or legal advice.
- Reply in the same language as the user (English or Hinglish). Keep it short: 2-5 sentences. Plain text; **bold** and "- " bullets are allowed, no headers. Never mention the draft, the reference or the knowledge base.

DRAFT ANSWER:
""" + draftText + "\n\nREFERENCE (other retrieved entries):\n" + ref;

    List<Map<String, Object>> messages = new ArrayList<>();
    messages.add(Map.of("role", "system", "content", system));
    if (history != null) {
      int from = Math.max(0, history.size() - 6);
      for (Turn t : history.subList(from, history.size())) {
        if (t == null || t.text() == null || t.text().isBlank()) continue;
        String text = t.text().length() > 600 ? t.text().substring(0, 600) : t.text();
        messages.add(Map.of("role", "user".equals(t.role()) ? "user" : "assistant", "content", text));
      }
    }
    messages.add(Map.of("role", "user", "content", message + (hinglish ? "\n(User writes in Hinglish, reply in Hinglish.)" : "")));

    long start = System.currentTimeMillis();
    try {
      Map<?, ?> res = webClient.post().uri("/chat/completions")
          .header("Authorization", "Bearer " + apiKey)
          .header("Content-Type", "application/json")
          .bodyValue(Map.of("model", model, "temperature", 0.3, "max_tokens", 350, "messages", messages))
          .retrieve().bodyToMono(Map.class).block(Duration.ofSeconds(25));
      Object choices = res == null ? null : res.get("choices");
      if (choices instanceof List<?> list && !list.isEmpty()) {
        Object msg = ((Map<?, ?>) list.get(0)).get("message");
        Object content = msg instanceof Map<?, ?> m ? m.get("content") : null;
        if (content != null && !content.toString().isBlank()) {
          log.info("[Chat] AI refined reply in {}ms (draft={}, {} KB entries)", System.currentTimeMillis() - start, draft == null ? "none" : draft.id(), context.size());
          return content.toString().trim();
        }
      }
      log.warn("[Chat] AI returned no content: {}", res);
    } catch (Exception e) {
      log.error("[Chat] AI call failed after {}ms ({}: {})", System.currentTimeMillis() - start, e.getClass().getSimpleName(), e.getMessage());
    }
    return null;
  }
}