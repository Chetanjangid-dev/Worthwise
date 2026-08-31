package com.spendwise.service;

import com.spendwise.dto.ApiDtos.*;
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

  public AIExplanationService(@Value("${app.openrouter.api-key}") String apiKey, @Value("${app.openrouter.model}") String model) {
    this.apiKey = apiKey; this.model = model;
  }

  public String explain(PurchaseRequest purchase, ProfileResponse profile, DecisionResponse decision) {
    if (apiKey == null || apiKey.isBlank()) {
      log.warn("[AI] SKIPPED — OPENROUTER_API_KEY is not configured. Using deterministic engine text as-is for '{}'.", purchase.name());
      return decision.aiExplanation() + " AI explanation unavailable because OPENROUTER_API_KEY is not configured.";
    }
    log.info("[AI] Calling OpenRouter model='{}' for purchase='{}' (decision={}, score={})...", model, purchase.name(), decision.decision(), decision.score());
    long start = System.currentTimeMillis();
    try {
      Map<String, Object> body = Map.of(
          "model", model,
          "messages", java.util.List.of(
              Map.of("role", "system", "content", "Explain deterministic financial purchase decisions. Do not override calculations. Return concise plain text."),
              Map.of("role", "user", "content", Map.of("purchase", purchase, "financialProfile", profile, "calculatedDecision", decision).toString())));
      Map<?, ?> res = webClient.post().uri("/chat/completions")
          .header("Authorization", "Bearer " + apiKey)
          .header("Content-Type", "application/json")
          .bodyValue(body).retrieve().bodyToMono(Map.class).block();
      long elapsedMs = System.currentTimeMillis() - start;
      Object choices = res == null ? null : res.get("choices");
      if (choices instanceof java.util.List<?> list && !list.isEmpty()) {
        Object message = ((Map<?, ?>) list.get(0)).get("message");
        Object content = message instanceof Map<?, ?> m ? m.get("content") : null;
        if (content != null && !content.toString().isBlank()) {
          String text = content.toString();
          log.info("[AI] ✅ RESPONSE RECEIVED in {}ms ({} chars): \"{}\"", elapsedMs, text.length(),
              text.length() > 160 ? text.substring(0, 160) + "..." : text);
          return text;
        }
      }
      log.warn("[AI] ⚠️ Call succeeded but returned no usable content after {}ms. Raw response: {}. Falling back to engine text.", elapsedMs, res);
    } catch (RuntimeException e) {
      long elapsedMs = System.currentTimeMillis() - start;
      log.error("[AI] ❌ CALL FAILED after {}ms ({}: {}). Falling back to deterministic engine text.", elapsedMs, e.getClass().getSimpleName(), e.getMessage());
      return decision.aiExplanation() + " AI explanation temporarily unavailable.";
    }
    return decision.aiExplanation();
  }
}