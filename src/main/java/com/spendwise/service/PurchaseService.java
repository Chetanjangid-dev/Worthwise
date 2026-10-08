package com.spendwise.service;

import com.spendwise.dto.ApiDtos.*;
import com.spendwise.engine.DecisionEngine;
import com.spendwise.entity.*;
import com.spendwise.exception.ApiException;
import com.spendwise.model.Enums.*;
import com.spendwise.repository.PurchaseDecisionRepository;
import java.math.BigDecimal;
import java.time.ZoneId;
import java.util.*;

import org.hibernate.id.uuid.UuidGenerator;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PurchaseService {
  private final PurchaseDecisionRepository decisions;
  private final ProfileService profiles;
  private final GoalService goals;
  private final DecisionEngine engine;
  private final AIExplanationService ai;
  private final MarketResearchService research;
  private  final UserContext users;
  public PurchaseService(UserContext users,PurchaseDecisionRepository decisions, ProfileService profiles, GoalService goals, DecisionEngine engine, AIExplanationService ai, MarketResearchService research) {
    this.decisions = decisions; this.profiles = profiles; this.goals = goals; this.engine = engine; this.ai = ai; this.research = research;
    this.users=users;
  }

  @Transactional
  public DecisionResponse evaluate(AppUser user, PurchaseRequest req) {
    PurchaseType type = req.purchaseType() == null ? PurchaseType.ONE_TIME : req.purchaseType();
    boolean emi = type == PurchaseType.EMI;
    if (emi) {
      if (req.downPayment() == null)
        throw new ApiException(HttpStatus.BAD_REQUEST, "Enter the down payment for an EMI purchase (use 0 if there is none).");
      if (req.monthlyEmi() == null || req.monthlyEmi().signum() <= 0)
        throw new ApiException(HttpStatus.BAD_REQUEST, "Enter the monthly EMI amount.");
      if (req.durationMonths() == null || req.durationMonths() <= 0)
        throw new ApiException(HttpStatus.BAD_REQUEST, "Enter the EMI duration in months.");
      if (req.downPayment().compareTo(req.price()) > 0)
        throw new ApiException(HttpStatus.BAD_REQUEST, "Down payment cannot be more than the product price.");
    }
    // One-time purchases carry no EMI/down-payment data, so it can never leak into the maths.
    PurchaseRequest normalized = new PurchaseRequest(
        req.productName() == null || req.productName().isBlank() ? req.name() : req.productName(),
        req.name(), req.category(), req.price(), type,
        emi ? req.monthlyEmi() : BigDecimal.ZERO, emi ? req.durationMonths() : null, req.reason(), req.productUrl(),
        emi ? req.downPayment() : BigDecimal.ZERO);
    FinancialProfile profile = profiles.entity(user);
    DecisionResponse calculated = engine.evaluate(normalized, profile, goals.active(user));
    String explanation = ai.explain(normalized, profiles.toResponse(profile), calculated);
    // Never throws: returns null if SerpApi is unavailable, so the financial analysis still succeeds.
    BigDecimal safeMax = calculated.safePriceRange() == null ? null : calculated.safePriceRange().get("max");
    MarketResearchResponse market = research.research(normalized, safeMax);
    PurchaseDecision saved = save(user, normalized, calculated, explanation);
    return withId(saved, calculated, explanation, market);
  }
    @Transactional 
    public DecisionResponse revaluate(AppUser user, UUID id) {
      PurchaseDecision pd = decisions.findByIdAndUser(id, user).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Purchase decision not found"));;
     String note = " [Re-evaluation of an earlier decision using the updated profile and financial health]";
     String baseReason = pd.getReason() == null ? "" : pd.getReason().replace(note, "");
     PurchaseRequest req = new PurchaseRequest(pd.getProductName(), pd.getProductName(), pd.getCategory(), pd.getPrice(), pd.getPurchaseType(), pd.getMonthlyEmi(), pd.getDurationMonths(), baseReason + note, pd.getProductUrl(),
         pd.getDownPayment() == null ? BigDecimal.ZERO : pd.getDownPayment());
     return  evaluate(user, req);
    }


  /**
   * "Done this purchase": the user confirms they actually bought it.
   * - BUY_NOW decision: apply the purchase to the profile directly.
   * - WAIT / DONT_BUY / CONSIDER_ALTERNATIVE: only allowed if savings (and, for EMI, surplus) stay above 0.
   * Effect on the profile: one-time -> savings -= price; EMI -> savings -= down payment and the monthly EMI
   * is added to existing EMI (so monthly surplus drops by the EMI).
   */
  @Transactional
  public DecisionItem markPurchased(AppUser user, UUID id) {
    PurchaseDecision pd = decisions.findByIdAndUser(id, user)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Purchase decision not found"));
    if (pd.isPurchased())
      throw new ApiException(HttpStatus.BAD_REQUEST, "You have already marked this purchase as done.");
    FinancialProfile profile = profiles.entity(user);
    boolean emi = pd.getPurchaseType() == PurchaseType.EMI && nz(pd.getMonthlyEmi()).signum() > 0;
    BigDecimal upfront = emi ? nz(pd.getDownPayment()) : nz(pd.getPrice());   // leaves savings now
    BigDecimal monthly = emi ? nz(pd.getMonthlyEmi()) : BigDecimal.ZERO;      // reduces monthly surplus
    BigDecimal savingsAfter = profile.getCurrentSavings().subtract(upfront);
    BigDecimal surplusNow = profile.getMonthlyIncome().subtract(ProfileService.expenses(profile));
    BigDecimal surplusAfter = surplusNow.subtract(monthly);

    // Hard rule for EVERY decision (even BUY_NOW): the profile must never go negative,
    // otherwise later analyses become meaningless.
    if (savingsAfter.signum() < 0 || surplusAfter.signum() < 0)
      throw new ApiException(HttpStatus.BAD_REQUEST,
          "This purchase would make your savings or monthly surplus negative (savings after: \u20b9"
          + savingsAfter.setScale(0, java.math.RoundingMode.HALF_UP) + ", monthly surplus after: \u20b9"
          + surplusAfter.setScale(0, java.math.RoundingMode.HALF_UP) + "). "
          + "Your profile was not changed, because a negative balance can lead to strange analysis. "
          + "Please update your profile (savings / income / expenses) first if your finances have changed.");

    if (pd.getDecision() != Decision.BUY_NOW) {
      boolean savingsOk = upfront.signum() == 0 || savingsAfter.signum() > 0;
      boolean surplusOk = monthly.signum() == 0 || surplusAfter.signum() > 0;
      if (!savingsOk || !surplusOk)
        throw new ApiException(HttpStatus.BAD_REQUEST,
            "You don't have enough money in your savings or monthly surplus to afford this purchase. "
            + "Buying it is not an option right now (it is impossible with your current profile) \u2014 "
            + "please update your profile first if your finances have changed.");
    }
    profile.setCurrentSavings(savingsAfter);
    if (monthly.signum() > 0) profile.setExistingEmi(profile.getExistingEmi().add(monthly));
    pd.setPurchased(true);
    pd.setPurchasedAt(java.time.Instant.now());
    decisions.save(pd);
    return toItem(pd);
  }

  public List<DecisionItem> history(AppUser user) {
    return decisions.findByUserOrderByCreatedAtDesc(user).stream().map(this::toItem).toList();
  }
  @Transactional
  public void deletepurchase(UUID id){
    AppUser user = users.currentUser();
    PurchaseDecision found = decisions.findByIdAndUser(id, user)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Purchase decision not found"));
    decisions.delete(found);
  }
  public DecisionItem get(AppUser user, UUID id) {
    return decisions.findByIdAndUser(id, user).map(this::toItem).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Purchase decision not found"));
  }

  private PurchaseDecision save(AppUser user, PurchaseRequest req, DecisionResponse r, String explanation) {
    PurchaseDecision p = new PurchaseDecision();//even thodugh we revaute the purchase we will  terta it as new decsion recird 
    p.setUser(user); p.setProductName(req.productName()); p.setCategory(req.category()); p.setPrice(req.price());
    p.setPurchaseType(req.purchaseType()); p.setMonthlyEmi(req.monthlyEmi()); p.setDurationMonths(req.durationMonths()); p.setDownPayment(req.downPayment());
    p.setReason(req.reason()); p.setProductUrl(req.productUrl()); p.setDecision(Decision.valueOf(r.decision()));
    p.setScore(r.score()); p.setSavingsAfterPurchase(r.savingsAfterPurchase()); p.setMonthlySurplusBefore(r.monthlySurplusBefore());
    p.setMonthlySurplusAfterPurchase(r.monthlySurplusAfterPurchase()); p.setRecommendedWaitMonths(r.recommendedWaitMonths());
    p.setSafePriceMin(r.safePriceRange().get("min")); p.setSafePriceMax(r.safePriceRange().get("max"));
    p.setGoalDelayMonths(r.goalDelayMonths()); p.setGoalCompletionDate(r.goalCompletionDate());
    p.setReasonCodes(String.join(",", r.reasonCodes())); p.setExplanation(explanation);
    return decisions.save(p);
  }
  private DecisionItem toItem(PurchaseDecision p) {
    DecisionResponse r = new DecisionResponse(p.getId().toString(), p.getDecision().name(), p.getScore(), "AFFORDABLE", "MEDIUM",
        p.getGoalDelayMonths() > 0 ? "MEDIUM" : "LOW", p.getPrice(), p.getSavingsAfterPurchase(), BigDecimal.ZERO,
        p.getMonthlySurplusBefore(), p.getMonthlySurplusAfterPurchase(), p.getRecommendedWaitMonths(), null, p.getGoalCompletionDate(),
        p.getGoalDelayMonths(), Map.of("min", nz(p.getSafePriceMin()), "max", nz(p.getSafePriceMax())),
        p.getReasonCodes() == null || p.getReasonCodes().isBlank() ? List.of() : List.of(p.getReasonCodes().split(",")),
        List.of(new ReasonResponse("positive", p.getExplanation())), List.of(), List.of(), p.getExplanation(), null);
    return new DecisionItem(new PurchaseSummary(p.getId().toString(), p.getProductName(), p.getCategory(), p.getPrice(), p.getPurchaseType(),
        p.getReason(), p.getCreatedAt().atZone(ZoneId.systemDefault()).toLocalDate().toString(),
        p.getMonthlyEmi(), p.getDurationMonths(), p.getProductUrl(), nz(p.getDownPayment()), p.isPurchased()), r);
  }
  private DecisionResponse withId(PurchaseDecision p, DecisionResponse r, String explanation, MarketResearchResponse market) {
    return new DecisionResponse(p.getId().toString(), r.decision(), r.score(), r.affordability(), r.financialImpact(), r.goalImpact(),
        r.purchasePrice(), r.savingsAfterPurchase(), r.emergencyFundTarget(), r.monthlySurplusBefore(), r.monthlySurplusAfterPurchase(),
        r.recommendedWaitMonths(), r.estimatedPurchaseDate(), r.goalCompletionDate(), r.goalDelayMonths(), r.safePriceRange(), r.reasonCodes(),
        r.reasons(), r.alternatives(), r.actionPlan(), explanation, market);
  }
  private BigDecimal nz(BigDecimal n){ return n == null ? BigDecimal.ZERO : n; }
}