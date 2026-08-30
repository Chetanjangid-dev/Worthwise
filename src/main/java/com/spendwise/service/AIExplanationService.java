package com.spendwise.service;

import com.spendwise.dto.ApiDtos.*;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

@Service
public class AIExplanationService {
  private final String apiKey;
  private final String model;
  private final WebClient webClient = WebClient.builder().baseUrl("https://openrouter.ai/api/v1").build();

  public AIExplanationService(@Value("${app.openrouter.api-key}") String apiKey, @Value("${app.openrouter.model}") String model) {
    this.apiKey = apiKey; this.model = model;
  }

  public String explain(PurchaseRequest purchase, ProfileResponse profile, DecisionResponse decision) {
    if (apiKey == null || apiKey.isBlank()) return decision.aiExplanation() + " AI explanation unavailable because OPENROUTER_API_KEY is not configured.";
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
      Object choices = res == null ? null : res.get("choices");
      if (choices instanceof java.util.List<?> list && !list.isEmpty()) {
        Object message = ((Map<?, ?>) list.get(0)).get("message");
        Object content = message instanceof Map<?, ?> m ? m.get("content") : null;
        if (content != null && !content.toString().isBlank()) return content.toString();
      }
    } catch (RuntimeException ignored) {
      return decision.aiExplanation() + " AI explanation temporarily unavailable.";
    }
    return decision.aiExplanation();
  }
}
