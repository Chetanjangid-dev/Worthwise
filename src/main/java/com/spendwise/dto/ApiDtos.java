package com.spendwise.dto;

import com.spendwise.model.Enums.*;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public final class ApiDtos {
  private ApiDtos() {}

  public record ProfileRequest(
      @PositiveOrZero BigDecimal monthlyIncome,
      @PositiveOrZero BigDecimal currentSavings,
      @PositiveOrZero BigDecimal emergencyFundTarget,
      Map<String, BigDecimal> expenseBreakdown,
      @PositiveOrZero BigDecimal existingEmi,
      RiskTolerance riskTolerance,
      SavingPriority savingPriority,
      PurchasePreference purchasePreference) {}

  public record ProfileResponse(
      String userId, BigDecimal monthlyIncome, BigDecimal monthlyExpenses,
      Map<String, BigDecimal> expenseBreakdown, BigDecimal currentSavings,
      BigDecimal emergencyFundTarget, BigDecimal existingEmi, String currency,
      Map<String, String> preferences, BigDecimal savingsRate, String debtBurden,
      String emergencyBuffer, String updatedAt) {}

  public record GoalRequest(
      @NotBlank String name, @Positive BigDecimal targetAmount,
      @PositiveOrZero BigDecimal currentAmount, @Future LocalDate targetDate,
      Priority priority) {}

  public record GoalResponse(
      String id, String name, String icon, BigDecimal targetAmount, BigDecimal currentAmount,
      BigDecimal remainingAmount, BigDecimal requiredMonthlySaving, LocalDate targetDate,
      Priority priority, GoalStatus status) {}

  public record PurchaseRequest(
      @NotBlank String productName, String name, @NotBlank String category,
      @Positive BigDecimal price, PurchaseType purchaseType,
      @PositiveOrZero BigDecimal monthlyEmi, @Positive Integer durationMonths,
      String reason, String productUrl) {}

  public record DecisionResponse(
      String id, String decision, int score, String affordability, String financialImpact,
      String goalImpact, BigDecimal purchasePrice, BigDecimal savingsAfterPurchase,
      BigDecimal emergencyFundTarget, BigDecimal monthlySurplusBefore,
      BigDecimal monthlySurplusAfterPurchase, int recommendedWaitMonths,
      LocalDate estimatedPurchaseDate, LocalDate goalCompletionDate, int goalDelayMonths,
      Map<String, BigDecimal> safePriceRange, List<String> reasonCodes,
      List<ReasonResponse> reasons, List<AlternativeResponse> alternatives,
      List<String> actionPlan, String aiExplanation) {}

  public record ReasonResponse(String type, String text) {}
  public record AlternativeResponse(String name, BigDecimal price, String impact) {}
  public record DecisionItem(PurchaseSummary purchase, DecisionResponse analysis) {}
  public record PurchaseSummary(String id, String name, String category, BigDecimal price,
      PurchaseType purchaseType, String reason, String createdAt) {}
  public record DashboardResponse(ProfileResponse profile, List<GoalResponse> goals, List<DecisionItem> recentDecisions) {}
}
