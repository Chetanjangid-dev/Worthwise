package com.spendwise.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.spendwise.dto.ApiDtos.*;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

@Service
public class AIExplanationService {
  private static final Logger log = LoggerFactory.getLogger(AIExplanationService.class);

  private final String apiKey;
  private final String model;
  private final WebClient webClient = WebClient.builder().baseUrl("https://openrouter.ai/api/v1").build();

  // JavaTimeModule is required so LocalDate fields in DecisionResponse serialize correctly.
  private final ObjectMapper mapper = new ObjectMapper()
      .registerModule(new JavaTimeModule())
      .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

  public AIExplanationService(@Value("${app.openrouter.api-key}") String apiKey, @Value("${app.openrouter.model}") String model) {
    this.apiKey = apiKey;
    this.model = model;
  }

  public String explain(PurchaseRequest purchase, ProfileResponse profile, DecisionResponse decision) {
    // The user should never see technical/config messages, so failures are only logged
    // and we quietly fall back to the base text.
    if (apiKey == null || apiKey.isBlank()) {
      log.warn("[AI] SKIPPED — OPENROUTER_API_KEY is not configured. Using base text for '{}'.", purchase.name());
      return decision.aiExplanation();
    }
    log.info("[AI] Calling OpenRouter model='{}' for purchase='{}' (decision={}, score={})...", model, purchase.name(), decision.decision(), decision.score());
    long start = System.currentTimeMillis();
    try {
      String purchaseJson = mapper.writeValueAsString(purchase);
      String profileJson = mapper.writeValueAsString(profile);
      String decisionJson = mapper.writeValueAsString(decision);

      String userContent = "Here is the data for one purchase the user is thinking about.\n\n"
          + "purchase = " + purchaseJson + "\n\n"
          + "userFinances = " + profileJson + "\n\n"
          + "outcome = " + decisionJson + "\n\n"
          + "Now write your reply to the user about THIS purchase, following your style rules exactly. "
          + "Use their real numbers (product name, price, their income/savings, wait time, cheaper option) "
          + "but never mention field names, enum values, scores, or anything technical.";

      String systemPrompt = """
          You are a warm, friendly money buddy inside a personal finance app called SpendWise. \
          You talk directly to the user ("you", "your") like a supportive friend chatting on WhatsApp, \
          the way ChatGPT would reply: natural, human, encouraging, never robotic.

          The decision about this purchase is already made and provided in the data. \
          Your job is to explain it kindly in everyday language. Never change or argue with the decision.

          STRICT RULES:
          - NEVER mention or hint at an "engine", "system", "algorithm", "calculation", "model", "verdict", "score", or "analysis". \
          The user must feel like a friend is simply looking at their situation.
          - NEVER print raw labels like BUY_NOW, WAIT, DONT_BUY, CONSIDER_ALTERNATIVE. Say it in plain words instead, e.g. \
          "this isn't a great time to buy it", "I'd wait a bit on this one", "go for it!", "a cheaper option might suit you better".
          - Never say things like "score of 0" or "-₹67,890 savings". If money would run short, say it simply, \
          e.g. "buying this now would wipe out your savings and leave nothing extra each month".
          - Speak about THEIR situation: their monthly income, expenses, savings, or what's left over each month.
          - Always mention the product name and at least one real amount. Use the ₹ symbol with Indian number format (₹67,890 / ₹1,25,000). \
          If a wait time or date is given, say it casually, e.g. "about 12 months", "around September 2027".
          - If a cheaper alternative exists, suggest it as a friendly idea with its price.
          - Be kind, never judgmental or scolding. If the answer is "no", stay positive and give hope or a next step.

          FORMAT (important, the reply must feel like real, thoughtful advice, not a short blurb):
          - Write 5 to 6 points, each on its own line, with a blank line between points.
          - Every point starts with a fitting emoji and is a FULL, helpful sentence or two (about 25-40 words), \
          explained simply so anyone can understand the "why", not just the "what".
          - Cover these in order:
            1. The honest, friendly answer: should they buy this now or not, and the main reason in plain words.
            2. Their money picture: what their income, expenses, savings and monthly leftover look like against the price.
            3. What would happen if they buy it now: effect on savings, monthly breathing room, and their goal if any.
            4. A smart plan: how long to wait, roughly how much to set aside each month, and when they could comfortably buy.
            5. A smarter option: the cheaper alternative with its price, or ideas like waiting for a sale, EMI only if it truly fits, or a good second-hand deal.
            6. A warm, motivating closing line that gives confidence and one small next step.
          - If there is no cheaper alternative or no goal in the data, skip that idea and use another useful tip instead. Still give 5 points.
          - If income, expenses or savings are ₹0 or missing, do NOT just repeat "₹0" again and again. \
          Gently say the numbers look empty and ask them to update their income and expenses for sharper advice, then still give useful general guidance.
          - Use 5-7 emojis in total, each matching the meaning (💰 ⏳ 🎯 ⚠️ 🎉 💡 😊 📅). Don't overdo it.
          - Plain text only. No markdown, no bullets, no numbering, no asterisks, no headers, no JSON.
          """;

      Map<String, Object> body = Map.of(
          "model", model,
          "temperature", 0.8,
          "messages", List.of(
              Map.of("role", "system", "content", systemPrompt),
              Map.of("role", "user", "content", userContent)));

      Map<?, ?> res = webClient.post().uri("/chat/completions")
          .header("Authorization", "Bearer " + apiKey)
          .header("Content-Type", "application/json")
          .bodyValue(body).retrieve().bodyToMono(Map.class).block();
      long elapsedMs = System.currentTimeMillis() - start;
      Object choices = res == null ? null : res.get("choices");
      if (choices instanceof List<?> list && !list.isEmpty()) {
        Object message = ((Map<?, ?>) list.get(0)).get("message");
        Object content = message instanceof Map<?, ?> m ? m.get("content") : null;
        if (content != null && !content.toString().isBlank()) {
          String text = content.toString().trim();
          log.info("[AI] ✅ RESPONSE RECEIVED in {}ms ({} chars): \"{}\"", elapsedMs, text.length(),
              text.length() > 160 ? text.substring(0, 160) + "..." : text);
          return text;
        }
      }
      log.warn("[AI] ⚠️ Call succeeded but returned no usable content after {}ms. Raw response: {}. Falling back to base text.", elapsedMs, res);
    } catch (Exception e) {
      long elapsedMs = System.currentTimeMillis() - start;
      log.error("[AI] ❌ CALL FAILED after {}ms ({}: {}). Falling back to base text.", elapsedMs, e.getClass().getSimpleName(), e.getMessage());
    }
    return decision.aiExplanation();
  }
}