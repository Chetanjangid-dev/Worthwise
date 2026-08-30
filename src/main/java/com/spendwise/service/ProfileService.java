package com.spendwise.service;

import com.spendwise.dto.ApiDtos.*;
import com.spendwise.entity.*;
import com.spendwise.exception.ApiException;
import com.spendwise.repository.FinancialProfileRepository;
import java.math.*;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProfileService {
  private final FinancialProfileRepository profiles;
  public ProfileService(FinancialProfileRepository profiles){ this.profiles = profiles; }

  public FinancialProfile entity(AppUser user) {
    return profiles.findByUser(user).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Financial profile not found"));
  }

  public ProfileResponse get(AppUser user){ return toResponse(entity(user)); }

  @Transactional
  public ProfileResponse update(AppUser user, ProfileRequest req) {
    FinancialProfile p = entity(user);
    if (req.monthlyIncome() != null) p.setMonthlyIncome(req.monthlyIncome());
    if (req.currentSavings() != null) p.setCurrentSavings(req.currentSavings());
    if (req.emergencyFundTarget() != null) p.setEmergencyFundTarget(req.emergencyFundTarget());
    if (req.existingEmi() != null) p.setExistingEmi(req.existingEmi());
    if (req.expenseBreakdown() != null) {
      Map<String, BigDecimal> e = req.expenseBreakdown();
      if (e.get("housing") != null) p.setHousingExpense(e.get("housing"));
      if (e.get("food") != null) p.setFoodExpense(e.get("food"));
      if (e.get("transport") != null) p.setTransportExpense(e.get("transport"));
      if (e.get("subscriptions") != null) p.setSubscriptionExpense(e.get("subscriptions"));
      if (e.get("other") != null) p.setOtherExpense(e.get("other"));
    }
    if (req.riskTolerance() != null) p.setRiskTolerance(req.riskTolerance());
    if (req.savingPriority() != null) p.setSavingPriority(req.savingPriority());
    if (req.purchasePreference() != null) p.setPurchasePreference(req.purchasePreference());
    return toResponse(p);
  }

  public ProfileResponse toResponse(FinancialProfile p) {
    BigDecimal expenses = expenses(p);
    BigDecimal surplus = p.getMonthlyIncome().subtract(expenses);
    BigDecimal savingsRate = p.getMonthlyIncome().signum() > 0
        ? surplus.max(BigDecimal.ZERO).divide(p.getMonthlyIncome(), 2, RoundingMode.HALF_UP)
        : BigDecimal.ZERO;
    return new ProfileResponse(
        p.getUser().getId().toString(), p.getMonthlyIncome(), expenses,
        Map.of("housing", p.getHousingExpense(), "food", p.getFoodExpense(), "transport", p.getTransportExpense(),
            "subscriptions", p.getSubscriptionExpense(), "other", p.getOtherExpense()),
        p.getCurrentSavings(), p.getEmergencyFundTarget(), p.getExistingEmi(), p.getCurrency(),
        Map.of("riskTolerance", p.getRiskTolerance().name(), "savingPriority", p.getSavingPriority().name(),
            "purchasePreference", p.getPurchasePreference().name()),
        savingsRate, p.getExistingEmi().compareTo(p.getMonthlyIncome().multiply(new BigDecimal("0.25"))) > 0 ? "HIGH" : "LOW",
        p.getCurrentSavings().compareTo(p.getEmergencyFundTarget()) >= 0 ? "STRONG" : "MODERATE",
        p.getUpdatedAt().toString());
  }

  public static BigDecimal expenses(FinancialProfile p) {
    return p.getHousingExpense().add(p.getFoodExpense()).add(p.getTransportExpense())
        .add(p.getSubscriptionExpense()).add(p.getOtherExpense()).add(p.getExistingEmi());
  }
}
