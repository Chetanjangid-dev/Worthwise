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

  public PurchaseService(PurchaseDecisionRepository decisions, ProfileService profiles, GoalService goals, DecisionEngine engine, AIExplanationService ai) {
    this.decisions = decisions; this.profiles = profiles; this.goals = goals; this.engine = engine; this.ai = ai;
  }

  @Transactional
  public DecisionResponse evaluate(AppUser user, PurchaseRequest req) {
    PurchaseRequest normalized = new PurchaseRequest(
        req.productName() == null || req.productName().isBlank() ? req.name() : req.productName(),
        req.name(), req.category(), req.price(), req.purchaseType() == null ? PurchaseType.ONE_TIME : req.purchaseType(),
        req.monthlyEmi() == null ? BigDecimal.ZERO : req.monthlyEmi(), req.durationMonths(), req.reason(), req.productUrl());
    FinancialProfile profile = profiles.entity(user);
    DecisionResponse calculated = engine.evaluate(normalized, profile, goals.active(user));
    String explanation = ai.explain(normalized, profiles.toResponse(profile), calculated);
    PurchaseDecision saved = save(user, normalized, calculated, explanation);
    return withId(saved, calculated, explanation);
  }

  public List<DecisionItem> history(AppUser user) {
    return decisions.findByUserOrderByCreatedAtDesc(user).stream().map(this::toItem).toList();
  }
  public DecisionItem get(AppUser user, UUID id) {
    return decisions.findByIdAndUser(id, user).map(this::toItem).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Purchase decision not found"));
  }

  private PurchaseDecision save(AppUser user, PurchaseRequest req, DecisionResponse r, String explanation) {
    PurchaseDecision p = new PurchaseDecision();
    p.setUser(user); p.setProductName(req.productName()); p.setCategory(req.category()); p.setPrice(req.price());
    p.setPurchaseType(req.purchaseType()); p.setMonthlyEmi(req.monthlyEmi()); p.setDurationMonths(req.durationMonths());
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
        List.of(new ReasonResponse("positive", p.getExplanation())), List.of(), List.of(), p.getExplanation());
    return new DecisionItem(new PurchaseSummary(p.getId().toString(), p.getProductName(), p.getCategory(), p.getPrice(), p.getPurchaseType(),
        p.getReason(), p.getCreatedAt().atZone(ZoneId.systemDefault()).toLocalDate().toString()), r);
  }
  private DecisionResponse withId(PurchaseDecision p, DecisionResponse r, String explanation) {
    return new DecisionResponse(p.getId().toString(), r.decision(), r.score(), r.affordability(), r.financialImpact(), r.goalImpact(),
        r.purchasePrice(), r.savingsAfterPurchase(), r.emergencyFundTarget(), r.monthlySurplusBefore(), r.monthlySurplusAfterPurchase(),
        r.recommendedWaitMonths(), r.estimatedPurchaseDate(), r.goalCompletionDate(), r.goalDelayMonths(), r.safePriceRange(), r.reasonCodes(),
        r.reasons(), r.alternatives(), r.actionPlan(), explanation);
  }
  private BigDecimal nz(BigDecimal n){ return n == null ? BigDecimal.ZERO : n; }
}
