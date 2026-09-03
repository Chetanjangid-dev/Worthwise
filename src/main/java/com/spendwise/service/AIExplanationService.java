package com.spendwise.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
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
  // NOTE: a plain `new ObjectMapper()` does NOT know how to serialize
  // java.time.LocalDate/LocalDateTime out of the box — that module is only
  // auto-registered on Spring's own auto-configured ObjectMapper bean, not on
  // one we construct ourselves here. Without registering JavaTimeModule,
  // serializing DecisionResponse (which has LocalDate fields like
  // estimatedPurchaseDate/goalCompletionDate) throws InvalidDefinitionException
  // on every single call, so the AI request never actually goes out and the
  // UI always falls back to "AI explanation temporarily unavailable."
  private final ObjectMapper mapper = new ObjectMapper()
      .registerModule(new JavaTimeModule())
      .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

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
      // IMPORTANT: the previous version sent Map.of(...).toString() as the user
      // message, which is a raw Java map dump (e.g. "{purchase=PurchaseRequest[...]}"),
      // not real JSON. The model could barely read it, so every reply came back
      // as a generic, near-identical paragraph. We now send well-formed JSON with
      // the actual numbers, so the model can react to *this specific* purchase.
      String purchaseJson = mapper.writeValueAsString(purchase);
      String profileJson = mapper.writeValueAsString(profile);
      String decisionJson = mapper.writeValueAsString(decision);

      String userContent = "Here is the data for one purchase decision.\n\n" +
          "purchase = " + purchaseJson + "\n\n" +
          "financialProfile = " + profileJson + "\n\n" +
          "calculatedDecision = " + decisionJson + "\n\n" +
          "Write the explanation for this exact purchase, referencing its real numbers (product name, price, decision, score, wait months, goal delay, etc).";

      String systemPrompt = "You are the friendly financial assistant inside a personal finance app called SpendWise. "
          + "A deterministic engine has already calculated the verdict (BUY_NOW, WAIT, DONT_BUY, or CONSIDER_ALTERNATIVE) "
          + "and the numbers behind it — never change, contradict, or re-decide the verdict yourself, just explain it. "
          + "Write like a supportive friend texting quick money advice: warm, conversational, 2-4 short sentences. "
          + "Naturally weave in 2-4 relevant emojis (e.g. money, warning, celebration, hourglass, target emojis) — do not overdo it. "
          + "Always mention the specific product name and at least one real number from the data (price, score, wait months, or goal delay) "
          + "so the response is clearly about THIS purchase and not a generic template. "
          + "Return plain text only, no markdown, no JSON, no headers.";

      Map<String, Object> body = Map.of(
          "model", model,
          "messages", java.util.List.of(
              Map.of("role", "system", "content", systemPrompt),
              Map.of("role", "user", "content", userContent)));
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
          String text = content.toString().trim();
          log.info("[AI] ✅ RESPONSE RECEIVED in {}ms ({} chars): \"{}\"", elapsedMs, text.length(),
              text.length() > 160 ? text.substring(0, 160) + "..." : text);
          return text;
        }
      }
      log.warn("[AI] ⚠️ Call succeeded but returned no usable content after {}ms. Raw response: {}. Falling back to engine text.", elapsedMs, res);
    } catch (Exception e) {
      long elapsedMs = System.currentTimeMillis() - start;
      log.error("[AI] ❌ CALL FAILED after {}ms ({}: {}). Falling back to deterministic engine text.", elapsedMs, e.getClass().getSimpleName(), e.getMessage());
      return decision.aiExplanation() + " AI explanation temporarily unavailable.";
    }
    return decision.aiExplanation();
  }
}