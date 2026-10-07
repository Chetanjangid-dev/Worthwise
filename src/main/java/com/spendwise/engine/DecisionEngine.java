package com.spendwise.engine;

import com.spendwise.dto.ApiDtos.*;
import com.spendwise.entity.*;
import com.spendwise.model.Enums.Decision;
import com.spendwise.model.Enums.PurchaseType;
import java.math.*;
import java.time.LocalDate;
import java.util.*;
import org.springframework.stereotype.Component;

@Component
public class DecisionEngine {
  public DecisionResponse evaluate(PurchaseRequest req, FinancialProfile profile, List<Goal> goals) {
    BigDecimal expenses = com.spendwise.service.ProfileService.expenses(profile);
    BigDecimal surplus = profile.getMonthlyIncome().subtract(expenses);
    BigDecimal price = req.price();
    BigDecimal emi = req.monthlyEmi() == null ? BigDecimal.ZERO : req.monthlyEmi();
    // EMI purchases hit the user's finances in two DIFFERENT places, each counted exactly once:
    //   - the down payment leaves SAVINGS today (the rest of the price is financed, so it never touches savings)
    //   - the monthly EMI reduces the monthly SURPLUS
    // One-time purchases take the full price out of savings and leave the surplus alone.
    boolean isEmi = req.purchaseType() == PurchaseType.EMI && emi.signum() > 0;
    int emiMonths = req.durationMonths() == null ? 0 : req.durationMonths();
    BigDecimal downPayment = req.downPayment() == null ? BigDecimal.ZERO : req.downPayment();
    BigDecimal upfront = isEmi ? downPayment : price;                         // cash leaving savings now
    BigDecimal totalCost = isEmi ? downPayment.add(emi.multiply(BigDecimal.valueOf(emiMonths))) : price; // what the user really pays
    BigDecimal savingsAfter = profile.getCurrentSavings().subtract(upfront);
    BigDecimal surplusAfter = isEmi ? surplus.subtract(emi) : surplus;
    Goal goal = goals.stream().filter(g -> g.getName().toLowerCase().contains(req.category().toLowerCase())).findFirst()
        .orElse(goals.stream().findFirst().orElse(null));
    int delay = goalDelay(goal, surplus, surplusAfter);
    List<String> codes = new ArrayList<>();
    int score = 100;
    if (savingsAfter.compareTo(BigDecimal.ZERO) < 0) { codes.add("INSUFFICIENT_SAVINGS"); score -= 45; }
    // Only flag the emergency fund if THIS purchase is what pushes savings below the target.
    // If savings were already below target beforehand, a small purchase isn't the cause and shouldn't be blamed for it.
    boolean purchaseCausesEmergencyFundDip = profile.getCurrentSavings().compareTo(profile.getEmergencyFundTarget()) >= 0
        && savingsAfter.compareTo(profile.getEmergencyFundTarget()) < 0;
    if (purchaseCausesEmergencyFundDip) { codes.add("BELOW_EMERGENCY_FUND"); score -= 25; }
    if (surplusAfter.compareTo(BigDecimal.ZERO) <= 0) { codes.add("NO_MONTHLY_SURPLUS_AFTER_PURCHASE"); score -= 20; }
    if (delay >= 2) { codes.add("GOAL_DELAY"); score -= Math.min(20, delay * 5); }
    // Affordability uses the burden that matches the payment type: whole price vs. surplus for one-time,
    // monthly EMI vs. surplus for EMI (the price was already handled via savings/surplus above).
    BigDecimal burden = isEmi ? emi : price;
    BigDecimal ratio = surplus.signum() > 0 ? burden.divide(surplus, 2, RoundingMode.HALF_UP) : new BigDecimal("99");
    BigDecimal affordLimit = isEmi ? new BigDecimal("0.5") : new BigDecimal("2.5");
    if (ratio.compareTo(affordLimit) > 0) { codes.add("LOW_AFFORDABILITY"); score -= 15; }
    score = Math.max(0, Math.min(100, score));

    // Trivial-purchase bypass: if the price is a negligible sliver of income and it doesn't push
    // savings negative, there's no meaningful financial decision to make here — just approve it.
    boolean isNegligiblePurchase = savingsAfter.signum() >= 0
        && profile.getMonthlyIncome().signum() > 0
        && totalCost.compareTo(profile.getMonthlyIncome().multiply(new BigDecimal("0.001"))) <= 0;

    Decision decision = isNegligiblePurchase ? Decision.BUY_NOW
        : decide(score, savingsAfter, profile.getEmergencyFundTarget(), delay);
    BigDecimal safeMax = profile.getCurrentSavings().subtract(profile.getEmergencyFundTarget()).max(BigDecimal.ZERO)
        .min(surplus.max(BigDecimal.ZERO).multiply(new BigDecimal("1.25")));
    int wait = waitMonths(upfront, safeMax, surplus.max(BigDecimal.ZERO));
    LocalDate purchaseDate = LocalDate.now().plusMonths(wait);
    LocalDate goalDate = goal == null ? LocalDate.now() : goal.getTargetDate().plusMonths(delay);
    List<ReasonResponse> reasons = isNegligiblePurchase
        ? List.of(new ReasonResponse("positive", "This purchase is a negligible fraction of your monthly income and doesn't warrant a full analysis."))
        : reasons(codes, decision, goal, delay, isEmi, downPayment, emi, emiMonths, totalCost, price);
    List<AlternativeResponse> alternatives = List.of(new AlternativeResponse("Comparable lower-cost option",
        totalCost.multiply(new BigDecimal("0.70")).setScale(0, RoundingMode.HALF_UP), "LOWER"));
    List<String> plan = actionPlan(decision, wait, safeMax, isEmi);
    return new DecisionResponse(null, decision.name(), score, score > 75 ? "AFFORDABLE" : "CONDITIONALLY_AFFORDABLE",
        delay > 2 ? "HIGH" : ratio.compareTo(isEmi ? new BigDecimal("0.4") : BigDecimal.ONE) > 0 ? "MEDIUM" : "LOW",
        delay > 0 ? "MEDIUM" : "LOW", price, savingsAfter, profile.getEmergencyFundTarget(), surplus, surplusAfter,
        wait, purchaseDate, goalDate, delay, Map.of("min", BigDecimal.ZERO, "max", safeMax), codes, reasons, alternatives, plan,
        fallbackExplanation(decision, wait, safeMax), null);
  }

  private Decision decide(int score, BigDecimal savingsAfter, BigDecimal emergencyTarget, int delay) {
    if (savingsAfter.signum() < 0 || score < 35) return Decision.DONT_BUY;
    if (savingsAfter.compareTo(emergencyTarget) < 0 && score >= 60) return Decision.WAIT;
    if (score < 60 && emergencyTarget.signum() > 0) return Decision.CONSIDER_ALTERNATIVE;
    if (delay >= 2 || score < 75) return Decision.WAIT;
    return Decision.BUY_NOW;
  }
  private int goalDelay(Goal goal, BigDecimal surplus, BigDecimal surplusAfter) {
    if (goal == null || surplus.signum() <= 0 || surplusAfter.signum() <= 0) return 0;
    BigDecimal remaining = goal.getTargetAmount().subtract(goal.getCurrentAmount()).max(BigDecimal.ZERO);
    int before = remaining.divide(surplus, 0, RoundingMode.CEILING).intValue();
    int after = remaining.divide(surplusAfter, 0, RoundingMode.CEILING).intValue();
    return Math.max(0, after - before);
  }
  private int waitMonths(BigDecimal price, BigDecimal safeMax, BigDecimal surplus) {
    if (price.compareTo(safeMax) <= 0) return 0;
    if (surplus.signum() <= 0) return 12;
    return price.subtract(safeMax).divide(surplus, 0, RoundingMode.CEILING).min(new BigDecimal("12")).intValue();
  }
  private List<ReasonResponse> reasons(List<String> codes, Decision d, Goal goal, int delay, boolean isEmi,
      BigDecimal downPayment, BigDecimal emi, int emiMonths, BigDecimal totalCost, BigDecimal price) {
    List<ReasonResponse> r = new ArrayList<>();
    if (isEmi) {
      BigDecimal extra = totalCost.subtract(price);
      String cost = "EMI total cost: ₹" + totalCost.setScale(0, RoundingMode.HALF_UP) + " (down payment ₹"
          + downPayment.setScale(0, RoundingMode.HALF_UP) + " + ₹" + emi.setScale(0, RoundingMode.HALF_UP) + " × " + emiMonths + " months)";
      r.add(new ReasonResponse(extra.signum() > 0 ? "warning" : "positive",
          extra.signum() > 0 ? cost + ", about ₹" + extra.setScale(0, RoundingMode.HALF_UP) + " more than the listed price." : cost + "."));
    }
    if (codes.contains("INSUFFICIENT_SAVINGS")) r.add(new ReasonResponse("warning", isEmi
        ? "Your down payment is more than your current savings."
        : "The purchase costs more than your current savings."));
    if (isEmi && codes.contains("NO_MONTHLY_SURPLUS_AFTER_PURCHASE")) r.add(new ReasonResponse("warning", "The monthly EMI would leave you with no monthly surplus."));
    if (codes.contains("BELOW_EMERGENCY_FUND")) r.add(new ReasonResponse("warning", "Buying now would put savings below the emergency reserve target."));
    if (delay > 0 && goal != null) r.add(new ReasonResponse("warning", "The " + goal.getName() + " goal may be delayed by about " + delay + " month(s)."));
    if (r.isEmpty()) r.add(new ReasonResponse("positive", "The purchase fits your current cash flow and savings buffer."));
    return r;
  }
  private List<String> actionPlan(Decision d, int wait, BigDecimal safeMax, boolean isEmi) {
    if (d == Decision.BUY_NOW) return List.of("Proceed without changing your current savings plan.", "Keep tracking this category in your decision history.");
    return List.of("Wait about " + wait + " month(s) before buying.",
        (isEmi ? "Keep the down payment around or below ₹" : "Look for options around or below ₹") + safeMax.setScale(0, RoundingMode.HALF_UP) + ".",
        "Re-evaluate after your next savings cycle.");
  }
  public String fallbackExplanation(Decision d, int wait, BigDecimal safeMax) {
    return switch (d) {
      case BUY_NOW -> "Deterministic analysis says this purchase is financially comfortable right now.";
      case WAIT -> "Waiting about " + wait + " month(s) gives your savings and goals more room.";
      case DONT_BUY -> "This purchase conflicts strongly with your current savings or cash-flow position.";
      case CONSIDER_ALTERNATIVE -> "A cheaper option near ₹" + safeMax.setScale(0, RoundingMode.HALF_UP) + " would be safer.";
    };
  }
}