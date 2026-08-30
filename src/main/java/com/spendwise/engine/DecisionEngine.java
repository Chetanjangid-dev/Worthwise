package com.spendwise.engine;

import com.spendwise.dto.ApiDtos.*;
import com.spendwise.entity.*;
import com.spendwise.model.Enums.Decision;
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
    BigDecimal savingsAfter = profile.getCurrentSavings().subtract(price);
    BigDecimal surplusAfter = surplus.subtract(emi);
    Goal goal = goals.stream().filter(g -> g.getName().toLowerCase().contains(req.category().toLowerCase())).findFirst()
        .orElse(goals.stream().findFirst().orElse(null));
    int delay = goalDelay(goal, surplus, surplusAfter);
    List<String> codes = new ArrayList<>();
    int score = 100;
    if (savingsAfter.compareTo(BigDecimal.ZERO) < 0) { codes.add("INSUFFICIENT_SAVINGS"); score -= 45; }
    if (savingsAfter.compareTo(profile.getEmergencyFundTarget()) < 0) { codes.add("BELOW_EMERGENCY_FUND"); score -= 25; }
    if (surplusAfter.compareTo(BigDecimal.ZERO) <= 0) { codes.add("NO_MONTHLY_SURPLUS_AFTER_PURCHASE"); score -= 20; }
    if (delay >= 2) { codes.add("GOAL_DELAY"); score -= Math.min(20, delay * 5); }
    BigDecimal ratio = surplus.signum() > 0 ? price.divide(surplus, 2, RoundingMode.HALF_UP) : new BigDecimal("99");
    if (ratio.compareTo(new BigDecimal("2.5")) > 0) { codes.add("HIGH_AFFORDABILITY_RATIO"); score -= 15; }
    score = Math.max(0, Math.min(100, score));
    Decision decision = decide(score, savingsAfter, profile.getEmergencyFundTarget(), delay);
    BigDecimal safeMax = profile.getCurrentSavings().subtract(profile.getEmergencyFundTarget()).max(BigDecimal.ZERO)
        .min(surplus.max(BigDecimal.ZERO).multiply(new BigDecimal("1.25")));
    int wait = waitMonths(price, safeMax, surplus.max(BigDecimal.ZERO));
    LocalDate purchaseDate = LocalDate.now().plusMonths(wait);
    LocalDate goalDate = goal == null ? LocalDate.now() : goal.getTargetDate().plusMonths(delay);
    List<ReasonResponse> reasons = reasons(codes, decision, goal, delay);
    List<AlternativeResponse> alternatives = List.of(new AlternativeResponse("Comparable lower-cost option",
        price.multiply(new BigDecimal("0.70")).setScale(0, RoundingMode.HALF_UP), "LOWER"));
    List<String> plan = actionPlan(decision, wait, safeMax);
    return new DecisionResponse(null, decision.name(), score, score > 75 ? "AFFORDABLE" : "CONDITIONALLY_AFFORDABLE",
        delay > 2 ? "HIGH" : ratio.compareTo(BigDecimal.ONE) > 0 ? "MEDIUM" : "LOW",
        delay > 0 ? "MEDIUM" : "LOW", price, savingsAfter, profile.getEmergencyFundTarget(), surplus, surplusAfter,
        wait, purchaseDate, goalDate, delay, Map.of("min", BigDecimal.ZERO, "max", safeMax), codes, reasons, alternatives, plan,
        fallbackExplanation(decision, wait, safeMax));
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
  private List<ReasonResponse> reasons(List<String> codes, Decision d, Goal goal, int delay) {
    List<ReasonResponse> r = new ArrayList<>();
    if (codes.contains("INSUFFICIENT_SAVINGS")) r.add(new ReasonResponse("warning", "The purchase costs more than your current savings."));
    if (codes.contains("BELOW_EMERGENCY_FUND")) r.add(new ReasonResponse("warning", "Buying now would put savings below the emergency reserve target."));
    if (delay > 0 && goal != null) r.add(new ReasonResponse("warning", "The " + goal.getName() + " goal may be delayed by about " + delay + " month(s)."));
    if (r.isEmpty()) r.add(new ReasonResponse("positive", "The purchase fits your current cash flow and savings buffer."));
    return r;
  }
  private List<String> actionPlan(Decision d, int wait, BigDecimal safeMax) {
    if (d == Decision.BUY_NOW) return List.of("Proceed without changing your current savings plan.", "Keep tracking this category in your decision history.");
    return List.of("Wait about " + wait + " month(s) before buying.", "Look for options around or below ₹" + safeMax.setScale(0, RoundingMode.HALF_UP) + ".", "Re-evaluate after your next savings cycle.");
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
