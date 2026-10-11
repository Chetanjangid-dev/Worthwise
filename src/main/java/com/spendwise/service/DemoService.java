package com.spendwise.service;

import com.spendwise.dto.AuthDtos.AuthResponse;
import com.spendwise.entity.*;
import com.spendwise.exception.ApiException;
import com.spendwise.model.Enums.Gender;
import com.spendwise.model.Enums.Priority;
import com.spendwise.repository.*;
import com.spendwise.security.JwtService;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * "Try demo": anyone can open a ready-made account (no signup / email) and run a couple of analyses.
 * Abuse is limited three ways: a demo account allows only MAX_EVALUATIONS analyses, the browser reuses its
 * existing demo account instead of making a new one on every click, and the number of new demo accounts is capped
 * per IP and per day. Demo accounts are deleted automatically after 24 hours.
 */
@Service
public class DemoService {
  private static final Logger log = LoggerFactory.getLogger(DemoService.class);
  public static final int MAX_EVALUATIONS = 2;
  private static final long LIFETIME_HOURS = 24;

  private final AppUserRepository users;
  private final FinancialProfileRepository profiles;
  private final GoalRepository goals;
  private final PurchaseDecisionRepository decisions;
  private final ApiUsageRepository apiUsage;
  private final PasswordEncoder encoder;
  private final JwtService jwt;
  private final int maxPerIpPerDay;
  private final int maxPerDay;

  public DemoService(AppUserRepository users, FinancialProfileRepository profiles, GoalRepository goals,
      PurchaseDecisionRepository decisions, ApiUsageRepository apiUsage, PasswordEncoder encoder, JwtService jwt,
      @Value("${app.demo.max-per-ip-per-day:1}") int maxPerIpPerDay,
      @Value("${app.demo.max-per-day:100}") int maxPerDay) {
    this.users = users; this.profiles = profiles; this.goals = goals; this.decisions = decisions;
    this.apiUsage = apiUsage; this.encoder = encoder; this.jwt = jwt;
    this.maxPerIpPerDay = maxPerIpPerDay; this.maxPerDay = maxPerDay;
  }

  /** Creates a fresh demo account with standard, pre-filled finances and a goal. */
  @Transactional
  public AuthResponse start(String ip) {
    Instant since = Instant.now().minus(24, ChronoUnit.HOURS);
    if (users.countByDemoTrueAndDemoIpAndCreatedAtAfter(ip, since) >= maxPerIpPerDay)
      throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
          "You've already tried the demo today. Please create a free account to keep going, or try the demo again tomorrow.");
    if (users.countByDemoTrueAndCreatedAtAfter(since) >= maxPerDay)
      throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
          "The demo has reached its daily limit. Please create a free account to continue, or try the demo again tomorrow.");

    AppUser user = new AppUser();
    user.setEmail("demo-" + UUID.randomUUID().toString().substring(0, 8) + "@demo.worthwise.local");
    user.setPasswordHash(encoder.encode(UUID.randomUUID().toString())); // nobody can log in with a password
    user.setName("Demo User");
    user.setGender(Gender.OTHER);
    user.setDemo(true);
    user.setDemoIp(ip);
    users.save(user);

    FinancialProfile p = new FinancialProfile();
    p.setUser(user);
    p.setMonthlyIncome(bd(60000));
    p.setHousingExpense(bd(15000));
    p.setFoodExpense(bd(8000));
    p.setTransportExpense(bd(3000));
    p.setSubscriptionExpense(bd(1000));
    p.setOtherExpense(bd(5000));
    p.setExistingEmi(bd(0));
    p.setCurrentSavings(bd(150000));      // total savings (includes the emergency fund)
    p.setEmergencyFundTarget(bd(60000));
    profiles.save(p);

    Goal g = new Goal();
    g.setUser(user);
    g.setName("Laptop fund");
    g.setTargetAmount(bd(100000));
    g.setCurrentAmount(bd(30000));
    g.setTargetDate(LocalDate.now().plusMonths(10));
    g.setPriority(Priority.HIGH);
    goals.save(g);

    return new AuthResponse(jwt.create(user.getEmail()), AuthService.toUserResponse(user));
  }

  /** Counts one analysis for a demo account; throws once the demo's analyses are used up. Does nothing for real accounts. */
  public void consumeEvaluation(AppUser user) {
    if (!user.isDemo()) return;
    if (users.consumeDemoEvaluation(user.getId(), MAX_EVALUATIONS) == 0)
      throw new ApiException(HttpStatus.FORBIDDEN,
          "You've used both demo analyses. Create a free account to analyze as many purchases as you like.");
  }

  /** Removes demo accounts (and their data) older than 24 hours. */
  @Scheduled(fixedDelay = 3_600_000L, initialDelay = 60_000L)
  @Transactional
  public void deleteExpiredDemoUsers() {
    var expired = users.findByDemoTrueAndCreatedAtBefore(Instant.now().minus(LIFETIME_HOURS, ChronoUnit.HOURS));
    for (AppUser u : expired) {
      goals.deleteAllByUserid(u);
      profiles.deleteAllByUserid(u);
      decisions.deleteAllByUserid(u);
      apiUsage.deleteAllByUserid(u);
      users.delete(u);
    }
    if (!expired.isEmpty()) log.info("[Demo] Deleted {} expired demo account(s)", expired.size());
  }

  private static BigDecimal bd(long v) { return BigDecimal.valueOf(v); }
}