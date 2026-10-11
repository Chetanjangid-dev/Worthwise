package com.spendwise.service;

import com.spendwise.dto.ApiDtos.*;
import com.spendwise.entity.*;
import com.spendwise.repository.ApiUsageRepository;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Monthly per-user quota for the two paid external APIs (AI explanation + Google/SerpApi search).
 * The deterministic decision engine is never limited - only these API calls are.
 */
@Service
public class ApiUsageService {
  public enum Api { AI, GOOGLE }

  private static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");

  private final ApiUsageRepository repo;
  private final TransactionTemplate tx;
  private final int aiLimit;
  private final int googleLimit;

  public ApiUsageService(ApiUsageRepository repo, PlatformTransactionManager txManager,
      @Value("${app.limits.ai-monthly:30}") int aiLimit,
      @Value("${app.limits.google-monthly:10}") int googleLimit) {
    this.repo = repo;
    // Own transaction: the count is saved right away, even if the surrounding analysis later fails (the API cost is spent anyway).
    this.tx = new TransactionTemplate(txManager);
    this.tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    this.aiLimit = aiLimit;
    this.googleLimit = googleLimit;
  }

  /**
   * Tries to use one request of this month's quota. Returns true (and counts it) if the user was still under the limit,
   * false if the monthly limit is already used up - in that case the caller must NOT call the external API.
   */
  public boolean tryConsume(AppUser user, Api api) {
    int limit = api == Api.AI ? aiLimit : googleLimit;
    if (limit <= 0) return false;
    String month = YearMonth.now(ZONE).toString(); // e.g. "2026-10" -> a new row (count 0) starts every month
    for (int attempt = 0; attempt < 2; attempt++) {
      try {
        return Boolean.TRUE.equals(tx.execute(status -> consumeOnce(user, month, api, limit)));
      } catch (DataIntegrityViolationException e) {
        // two first-requests of the month created the row at the same moment; the retry finds it
      }
    }
    return false;
  }

  /** This month's usage and limits for the dashboard. */
  public ApiUsageResponse usageFor(AppUser user) {
    YearMonth month = YearMonth.now(ZONE);
    ApiUsage row = repo.findByUserAndUsageMonth(user, month.toString()).orElse(null);
    int ai = row == null ? 0 : row.getAiRequests();
    int google = row == null ? 0 : row.getGoogleRequests();
    return new ApiUsageResponse(month.toString(), month.plusMonths(1).atDay(1).toString(), List.of(
        item("AI", "AI explanations", ai, aiLimit),
        item("GOOGLE", "Google product search", google, googleLimit)));
  }

  private static ApiUsageItem item(String api, String label, int used, int limit) {
    return new ApiUsageItem(api, label, used, limit, Math.max(0, limit - used));
  }

  private boolean consumeOnce(AppUser user, String month, Api api, int limit) {
    if (increment(user, month, api, limit) == 1) return true;
    if (repo.findByUserAndUsageMonth(user, month).isPresent()) return false; // row exists -> limit reached
    repo.saveAndFlush(new ApiUsage(user, month));                           // first API use of this month
    return increment(user, month, api, limit) == 1;
  }

  private int increment(AppUser user, String month, Api api, int limit) {
    return api == Api.AI ? repo.incrementAiIfUnderLimit(user, month, limit) : repo.incrementGoogleIfUnderLimit(user, month, limit);
  }
}