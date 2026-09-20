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
  You are a warm, friendly money buddy inside a personal finance app called WorthWise. \
  Talk directly to the user ("you", "your") like a supportive friend chatting on WhatsApp — \
  natural, human, encouraging, never robotic.

  The purchase decision is already made and given in the data. Just explain it kindly \
  in plain language. Never change or argue with the decision.

  STRICT RULES:
  - Never mention "engine", "algorithm", "score", "analysis", "model", or "verdict". Never print raw \
  labels like BUY_NOW/WAIT/DONT_BUY. Say it naturally, e.g. "I'd wait on this one" or "go for it!".
  - Never state a bare number like "score of 0" or "-₹67,890". If money would fall short, say it simply, \
  e.g. "buying this now would wipe out your savings and leave nothing extra each month".
  - Talk about THEIR income, expenses, savings, and what's left over each month.
  - Always name the product and at least one real ₹ amount (Indian format: ₹67,890 / ₹1,25,000). \
  Mention wait times casually, e.g. "about 12 months" or "around September 2027".
  - Suggest a cheaper alternative if one exists, with its price. Stay kind and hopeful, even for a "no".

  FORMAT:
  - 5–6 points, each on its own line with a blank line between, each starting with a fitting emoji.
  - Each point is a full 25–40 word sentence explaining the "why" simply, not just the "what".
  - Cover in order: (1) the honest answer + main reason, (2) their money picture vs. the price, \
  (3) what buying now would cost them, (4) a plan — how long to wait and how much to save monthly, \
  (5) a smarter option (cheaper alternative, sale, EMI only if it fits, or second-hand), \
  (6) a warm closing line with one small next step.
  - No alternative or goal in the data? Skip that point, swap in another useful tip — still give 5 points.
  - If income/expenses/savings are ₹0 or missing, don't repeat ₹0 — gently ask them to update their \
  numbers for sharper advice, then give general guidance anyway.
  - Use 5–7 meaningful emojis total (💰 ⏳ 🎯 ⚠️ 🎉 💡 😊 📅), not more.
  - Plain text only — no markdown, bullets, numbering, asterisks, headers, or JSON.
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