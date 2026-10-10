package com.spendwise.engine;

import static org.assertj.core.api.Assertions.assertThat;

import com.spendwise.dto.ApiDtos.DecisionResponse;
import com.spendwise.dto.ApiDtos.PurchaseRequest;
import com.spendwise.entity.FinancialProfile;
import com.spendwise.entity.Goal;
import com.spendwise.model.Enums.Decision;
import com.spendwise.model.Enums.PurchaseType;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class DecisionEngineEdgeCasesTest {

  private DecisionEngine engine;
  private FinancialProfile profile;

  // Base user: income 50,000 | expenses 30,000 | surplus 20,000
  // savings 100,000 | emergency fund target 60,000
  @BeforeEach
  void setUp() {
    engine = new DecisionEngine();
    profile = new FinancialProfile();
    profile.setMonthlyIncome(bd(50000));
    profile.setHousingExpense(bd(15000));
    profile.setFoodExpense(bd(8000));
    profile.setTransportExpense(bd(2000));
    profile.setSubscriptionExpense(bd(1000));
    profile.setOtherExpense(bd(4000));
    profile.setExistingEmi(bd(0));
    profile.setCurrentSavings(bd(100000));
    profile.setEmergencyFundTarget(bd(60000));
  }

  // ===================== Emergency fund rules =====================

  @Test
  void savingsExactlyEqualToEmergencyTargetAfterPurchase_isNotFlagged() {
    // 100,000 - 40,000 = 60,000 (exactly the target, so no dip)
    DecisionResponse r = engine.evaluate(oneTime("Books", 40000), profile, List.of());

    assertThat(r.decision()).isEqualTo("BUY_NOW");
    assertThat(r.reasonCodes()).isEmpty();
  }

  @Test
  void savingsAlreadyBelowTarget_purchaseIsNotBlamedButStillWait() {
    profile.setCurrentSavings(bd(40000)); // already below the 60,000 target
    DecisionResponse r = engine.evaluate(oneTime("Books", 5000), profile, List.of());

    assertThat(r.reasonCodes()).doesNotContain("BELOW_EMERGENCY_FUND");
    assertThat(r.decision()).isEqualTo("WAIT");
  }

  // ===================== Affordability =====================

  @Test
  void priceAboveAffordabilityLimit_isFlaggedAndWait() {
    // ratio 51,000 / 20,000 = 2.55 (limit is 2.5), savings drop to 49,000
    DecisionResponse r = engine.evaluate(oneTime("Electronics", 51000), profile, List.of());

    assertThat(r.reasonCodes()).contains("LOW_AFFORDABILITY", "BELOW_EMERGENCY_FUND");
    assertThat(r.score()).isEqualTo(60);
    assertThat(r.decision()).isEqualTo("WAIT");
  }

  // ===================== Score and decision boundaries =====================

  @Test
  void worstCase_scoreNeverGoesBelowZero() {
    // penalties add up to 105, so the raw score would be -5
    PurchaseRequest req = emi("Car", 500000, 150000, 25000, 12);
    DecisionResponse r = engine.evaluate(req, profile, List.of());

    assertThat(r.score()).isEqualTo(0);
    assertThat(r.decision()).isEqualTo("DONT_BUY");
  }

  @Test
  void mediumScoreWithSavingsLeft_isConsiderAlternative() {
    // down 80,000 -> savings 20,000 (below target), EMI 25,000 > surplus -> score 40
    PurchaseRequest req = emi("Car", 200000, 80000, 25000, 12);
    DecisionResponse r = engine.evaluate(req, profile, List.of());

    assertThat(r.score()).isEqualTo(40);
    assertThat(r.decision()).isEqualTo("CONSIDER_ALTERNATIVE");
  }

  // ===================== Wait months and safe price =====================

  @Test
  void waitCase_hasCorrectWaitMonthsSafePriceAndPlan() {
    // safe max = min(100,000 - 60,000, 20,000 x 1.25) = 25,000
    // wait = ceil((50,000 - 25,000) / 20,000) = 2 months
    DecisionResponse r = engine.evaluate(oneTime("Electronics", 50000), profile, List.of());

    assertThat(r.recommendedWaitMonths()).isEqualTo(2);
    assertThat(r.safePriceRange().get("max")).isEqualByComparingTo("25000");
    assertThat(r.estimatedPurchaseDate()).isEqualTo(LocalDate.now().plusMonths(2));
    assertThat(r.actionPlan().get(0)).contains("Wait about 2");
    assertThat(r.actionPlan().get(1)).contains("25000");
  }

  @Test
  void waitMonthsAreCappedAtTwelve() {
    profile.setHousingExpense(bd(34000)); // expenses 49,000 -> surplus only 1,000
    DecisionResponse r = engine.evaluate(oneTime("Electronics", 100000), profile, List.of());

    assertThat(r.recommendedWaitMonths()).isEqualTo(12);
  }

  @Test
  void zeroSurplus_waitIsTwelveAndSurplusFlagged() {
    profile.setMonthlyIncome(bd(30000)); // income == expenses
    DecisionResponse r = engine.evaluate(oneTime("Shoes", 1000), profile, List.of());

    assertThat(r.recommendedWaitMonths()).isEqualTo(12);
    assertThat(r.reasonCodes()).contains("NO_MONTHLY_SURPLUS_AFTER_PURCHASE");
  }

  @Test
  void negativeSurplus_isHandledWithoutCrashing() {
    profile.setMonthlyIncome(bd(20000)); // expenses 30,000 -> surplus -10,000
    DecisionResponse r = engine.evaluate(oneTime("Shoes", 1000), profile, List.of());

    assertThat(r.decision()).isEqualTo("WAIT");
    assertThat(r.reasonCodes()).contains("NO_MONTHLY_SURPLUS_AFTER_PURCHASE", "LOW_AFFORDABILITY");
    assertThat(r.safePriceRange().get("max")).isEqualByComparingTo("0");
  }

  // ===================== Expenses and EMI details =====================

  @Test
  void existingEmiIsCountedAsAnExpense() {
    profile.setExistingEmi(bd(10000)); // expenses 40,000 -> surplus 10,000
    DecisionResponse r = engine.evaluate(oneTime("Books", 5000), profile, List.of());

    assertThat(r.monthlySurplusBefore()).isEqualByComparingTo("10000");
    assertThat(r.monthlySurplusAfterPurchase()).isEqualByComparingTo("10000");
  }

  @Test
  void emiTypeWithZeroEmi_isTreatedAsOneTimePurchase() {
    PurchaseRequest req = new PurchaseRequest(
        "Test product", "Test product", "Phone", bd(5000),
        PurchaseType.EMI, BigDecimal.ZERO, 12, "testing", null, bd(1000));
    DecisionResponse r = engine.evaluate(req, profile, List.of());

    assertThat(r.savingsAfterPurchase()).isEqualByComparingTo("95000"); // full price leaves savings
    assertThat(r.monthlySurplusAfterPurchase()).isEqualByComparingTo("20000"); // surplus untouched
  }

  // ===================== Alternatives =====================

  @Test
  void alternative_isSeventyPercentOfOneTimePrice() {
    DecisionResponse r = engine.evaluate(oneTime("Books", 10000), profile, List.of());

    assertThat(r.alternatives()).hasSize(1);
    assertThat(r.alternatives().get(0).price()).isEqualByComparingTo("7000");
    assertThat(r.alternatives().get(0).impact()).isEqualTo("LOWER");
  }

  @Test
  void alternative_forEmiIsSeventyPercentOfTotalCost() {
    // total cost = 10,000 + 5,000 x 12 = 70,000 -> 70% = 49,000
    DecisionResponse r = engine.evaluate(emi("Phone", 60000, 10000, 5000, 12), profile, List.of());

    assertThat(r.alternatives().get(0).price()).isEqualByComparingTo("49000");
  }

  // ===================== Goals =====================

  @Test
  void goalIsMatchedByCategory_ignoringCase() {
    Goal vacation = goal("Vacation", 500000, 0);
    Goal laptop = goal("Laptop fund", 100000, 0);

    // Laptop goal: 5 months before, 10 months after = delay 5.
    // (If the Vacation goal were wrongly used, delay would be 25.)
    DecisionResponse r = engine.evaluate(
        emi("LAPTOP", 120000, 0, 10000, 12), profile, List.of(vacation, laptop));

    assertThat(r.goalDelayMonths()).isEqualTo(5);
  }

  @Test
  void noCategoryMatch_fallsBackToFirstGoal() {
    Goal vacation = goal("Vacation", 100000, 0);

    DecisionResponse r = engine.evaluate(
        emi("Phone", 60000, 0, 10000, 12), profile, List.of(vacation));

    assertThat(r.goalDelayMonths()).isEqualTo(5);
  }

  @Test
  void goalDelayOfOneMonth_isNotFlagged() {
    Goal laptop = goal("Laptop fund", 100000, 0);

    // surplus 20,000 -> 18,000: goal takes 6 months instead of 5 = delay 1
    DecisionResponse r = engine.evaluate(
        emi("Laptop", 24000, 0, 2000, 12), profile, List.of(laptop));

    assertThat(r.goalDelayMonths()).isEqualTo(1);
    assertThat(r.reasonCodes()).doesNotContain("GOAL_DELAY");
    assertThat(r.decision()).isEqualTo("BUY_NOW");
  }

  @Test
  void alreadyCompletedGoal_hasNoDelay() {
    Goal done = goal("Laptop fund", 100000, 100000);

    DecisionResponse r = engine.evaluate(
        emi("Laptop", 120000, 0, 10000, 12), profile, List.of(done));

    assertThat(r.goalDelayMonths()).isEqualTo(0);
    assertThat(r.reasonCodes()).doesNotContain("GOAL_DELAY");
  }

  @Test
  void goalCompletionDate_isTargetDatePlusDelay() {
    Goal laptop = goal("Laptop fund", 100000, 0);

    DecisionResponse r = engine.evaluate(
        emi("Laptop", 120000, 0, 10000, 12), profile, List.of(laptop));

    assertThat(r.goalCompletionDate()).isEqualTo(laptop.getTargetDate().plusMonths(5));
  }

  // ===================== Fallback text (when AI is unavailable) =====================

  @Test
  void fallbackExplanation_existsForEveryDecision() {
    assertThat(engine.fallbackExplanation(Decision.BUY_NOW, 0, bd(0))).contains("comfortable");
    assertThat(engine.fallbackExplanation(Decision.WAIT, 3, bd(0))).contains("3 month(s)");
    assertThat(engine.fallbackExplanation(Decision.DONT_BUY, 0, bd(0))).contains("conflicts");
    assertThat(engine.fallbackExplanation(Decision.CONSIDER_ALTERNATIVE, 0, new BigDecimal("25000.00")))
        .contains("25000");
  }

  // ===================== helpers =====================

  private static BigDecimal bd(long value) {
    return BigDecimal.valueOf(value);
  }

  private static Goal goal(String name, long target, long current) {
    Goal g = new Goal();
    g.setName(name);
    g.setTargetAmount(bd(target));
    g.setCurrentAmount(bd(current));
    g.setTargetDate(LocalDate.now().plusYears(1));
    return g;
  }

  private static PurchaseRequest oneTime(String category, long price) {
    return new PurchaseRequest(
        "Test product", "Test product", category, bd(price),
        PurchaseType.ONE_TIME, BigDecimal.ZERO, null, "testing", null, null);
  }

  private static PurchaseRequest emi(String category, long price, long down, long monthly, int months) {
    return new PurchaseRequest(
        "Test product", "Test product", category, bd(price),
        PurchaseType.EMI, bd(monthly), months, "testing", null, bd(down));
  }
}