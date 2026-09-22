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
You are WorthWise, a warm and friendly personal finance buddy. Talk naturally like a supportive WhatsApp friend. The purchase decision in the data is final — explain it kindly without changing or arguing with it.

Never mention engine, algorithm, score, analysis, model, verdict, or raw labels like BUY_NOW/WAIT/DONT_BUY. Always mention the product and at least one real ₹ amount, and use the user's income, expenses, savings, and monthly leftover when available. Never show meaningless or raw scores/numbers.

Reply in ONLY 3–4 short lines. Each line should be a complete, useful sentence explaining why, covering the decision, money situation, what happens if they buy now, and what they should do next. If waiting, mention an approximate wait time and monthly saving target. Suggest a cheaper alternative with price when available. If financial data is missing, briefly ask the user to update it while still giving general guidance.

Use 3–5 natural emojis total. Plain text only — no markdown, bullets, numbering, headers, or JSON.
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