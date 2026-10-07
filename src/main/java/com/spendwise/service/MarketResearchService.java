package com.spendwise.service;

import com.spendwise.dto.ApiDtos.*;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

/**
 * Real-time product research via SerpApi Google Shopping.
 * Makes at most ONE SerpApi call per analysis and never throws: on any failure it
 * logs (without the API key) and returns null so the financial analysis is unaffected.
 */
@Service
public class MarketResearchService {
  private static final Logger log = LoggerFactory.getLogger(MarketResearchService.class);
  private static final int MAX_RESULTS = 8;
  private static final int MAX_RESULTS_TO_SCAN = 40;

  private final String apiKey;
  private final WebClient webClient = WebClient.builder()
      .baseUrl("https://serpapi.com")
      .codecs(c -> c.defaultCodecs().maxInMemorySize(4 * 1024 * 1024))
      .build();

  public MarketResearchService(@Value("${serpapi.api.key:}") String apiKey) {
    this.apiKey = apiKey;
  }

  public MarketResearchResponse research(PurchaseRequest purchase, BigDecimal safeMaxPrice) {
    if (apiKey == null || apiKey.isBlank()) {
      log.warn("[Research] SKIPPED — SERPAPI_API_KEY is not configured.");
      return null;
    }
    String query = purchase.productName() != null && !purchase.productName().isBlank()
        ? purchase.productName().trim()
        : (purchase.category() == null ? "" : purchase.category().trim());
    if (query.isBlank()) return null;

    // For EMI, "cheaper" is judged against what the user would REALLY pay: down payment + EMI x months.
    BigDecimal emiTotal = null;
    if (purchase.purchaseType() == com.spendwise.model.Enums.PurchaseType.EMI
        && purchase.monthlyEmi() != null && purchase.monthlyEmi().signum() > 0 && purchase.durationMonths() != null) {
      BigDecimal dp = purchase.downPayment() == null ? BigDecimal.ZERO : purchase.downPayment();
      emiTotal = dp.add(purchase.monthlyEmi().multiply(BigDecimal.valueOf(purchase.durationMonths())));
    }

    long start = System.currentTimeMillis();
    try {
      Map<?, ?> res = webClient.get()
          .uri(u -> u.path("/search")
              .queryParam("engine", "google_shopping")
              .queryParam("q", query)
              .queryParam("gl", "in")
              .queryParam("hl", "en")
              .queryParam("num", MAX_RESULTS_TO_SCAN)
              .queryParam("api_key", apiKey)
              .build())
          .retrieve().bodyToMono(Map.class)
          .timeout(Duration.ofSeconds(10)).block();

      if (res == null) return null;
      if (res.get("error") != null) {
        log.warn("[Research] SerpApi returned an error for '{}': {}", query, res.get("error"));
        return null;
      }
      List<MarketResultResponse> results = new ArrayList<>();
      if (res.get("shopping_results") instanceof List<?> items) {
        for (Object o : items) {
          if (!(o instanceof Map<?, ?> m)) continue;
          String title = str(m.get("title"));
          if (title == null) continue; // unusable without a title
          BigDecimal extractedPrice = decimal(m.get("extracted_price"));
          if (!isUsefulCandidate(extractedPrice, safeMaxPrice, purchase.price(), emiTotal)) continue;
          String link = str(m.get("link"));
          if (link == null) link = str(m.get("product_link"));
          results.add(new MarketResultResponse(title, str(m.get("price")), extractedPrice,
              str(m.get("source")), dbl(m.get("rating")), integer(m.get("reviews")),
              str(m.get("thumbnail")), link));
          if (results.size() >= MAX_RESULTS) break;
        }
      }
      log.info("[Research] '{}' around {} / safe {} -> {} results in {}ms", query, purchase.price(),
          safeMaxPrice == null ? "no safe max" : safeMaxPrice, results.size(), System.currentTimeMillis() - start);
      return new MarketResearchResponse(query, results);
    } catch (Exception e) {
      // Message deliberately limited to the exception type/message; the request URL (with api_key) is never logged.
      log.error("[Research] FAILED for '{}' after {}ms ({})", query, System.currentTimeMillis() - start, e.getClass().getSimpleName());
      return null;
    }
  }

  private static String str(Object o) { return o == null || o.toString().isBlank() ? null : o.toString().trim(); }
  private static Double dbl(Object o) {
    if (o instanceof Number n) return n.doubleValue();
    try { return o == null ? null : Double.valueOf(o.toString()); } catch (NumberFormatException e) { return null; }
  }
  private static Integer integer(Object o) {
    if (o instanceof Number n) return n.intValue();
    try { return o == null ? null : Integer.valueOf(o.toString().replace(",", "")); } catch (NumberFormatException e) { return null; }
  }
  private static BigDecimal decimal(Object o) {
    if (o instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
    try { return o == null ? null : new BigDecimal(o.toString()); } catch (NumberFormatException e) { return null; }
  }
  private static boolean isUsefulCandidate(BigDecimal price, BigDecimal safeMaxPrice, BigDecimal purchasePrice, BigDecimal emiTotal) {
    if (price == null || purchasePrice == null || purchasePrice.signum() <= 0) return false;
    BigDecimal aroundMin = purchasePrice.multiply(new BigDecimal("0.75"));
    BigDecimal aroundMax = purchasePrice.multiply(new BigDecimal("1.25"));
    boolean aroundEnteredPrice = price.compareTo(aroundMin) >= 0 && price.compareTo(aroundMax) <= 0;

    if (emiTotal != null) {
      // EMI: any option that costs less than the total EMI outlay is a real saving.
      return aroundEnteredPrice || price.compareTo(emiTotal) < 0;
    }
    BigDecimal cheaperMax = safeMaxPrice != null && safeMaxPrice.signum() > 0
        ? safeMaxPrice.min(purchasePrice)
        : purchasePrice;
    boolean cheaperAndUseful = price.compareTo(purchasePrice) < 0 && price.compareTo(cheaperMax) <= 0;
    return aroundEnteredPrice || cheaperAndUseful;
  }
}