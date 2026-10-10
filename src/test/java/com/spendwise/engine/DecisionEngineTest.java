package com.spendwise.engine;

import static org.assertj.core.api.Assertions.assertThat;

import com.spendwise.dto.ApiDtos.DecisionResponse;
import com.spendwise.dto.ApiDtos.PurchaseRequest;
import com.spendwise.entity.FinancialProfile;
import com.spendwise.entity.Goal;
import com.spendwise.model.Enums.PurchaseType;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class DecisionEngineTest {

  private DecisionEngine engine;
  private FinancialProfile profile;

  // Test user: income 50,000, expenses 30,000 -> monthly surplus 20,000
  // savings 100,000, emergency fund target 60,000
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

  @Test
  void smallAffordablePurchase_isBuyNow() {
    DecisionResponse r = engine.evaluate(oneTime("Books", 5000), profile, List.of());

    assertThat(r.decision()).isEqualTo("BUY_NOW");
    assertThat(r.score()).isEqualTo(100);
    assertThat(r.reasonCodes()).isEmpty();
  }

  @Test
  void priceMoreThanSavings_isDontBuy() {
    DecisionResponse r = engine.evaluate(oneTime("Electronics", 150000), profile, List.of());

    assertThat(r.decision()).isEqualTo("DONT_BUY");
    assertThat(r.reasonCodes()).contains("INSUFFICIENT_SAVINGS");
    assertThat(r.savingsAfterPurchase()).isEqualByComparingTo("-50000");
  }

  @Test
  void purchaseThatBreaksEmergencyFund_isWait() {
    // 100,000 - 50,000 = 50,000 which is below the 60,000 emergency target
    DecisionResponse r = engine.evaluate(oneTime("Electronics", 50000), profile, List.of());

    assertThat(r.decision()).isEqualTo("WAIT");
    assertThat(r.reasonCodes()).contains("BELOW_EMERGENCY_FUND");
  }

  @Test
  void veryTinyPurchase_isApprovedWithoutFullAnalysis() {
    // 40 is less than 0.1% of income (50), so it is treated as negligible
    DecisionResponse r = engine.evaluate(oneTime("Snacks", 40), profile, List.of());

    assertThat(r.decision()).isEqualTo("BUY_NOW");
    assertThat(r.reasons().get(0).text()).contains("negligible");
  }

  @Test
  void emiPurchase_onlyDownPaymentLeavesSavings_andEmiReducesSurplus() {
    // price 60,000, down payment 10,000, EMI 5,000 x 12 months
    PurchaseRequest req = emi("Phone", 60000, 10000, 5000, 12);
    DecisionResponse r = engine.evaluate(req, profile, List.of());

    assertThat(r.savingsAfterPurchase()).isEqualByComparingTo("90000");        // 100,000 - 10,000
    assertThat(r.monthlySurplusAfterPurchase()).isEqualByComparingTo("15000"); // 20,000 - 5,000
    assertThat(r.reasons().get(0).text()).contains("70000");                    // 10,000 + 5,000 x 12
  }

  @Test
  void emiThatWipesOutSurplus_isFlagged() {
    // EMI 25,000 is more than the 20,000 monthly surplus
    PurchaseRequest req = emi("Bike", 300000, 0, 25000, 12);
    DecisionResponse r = engine.evaluate(req, profile, List.of());

    assertThat(r.reasonCodes()).contains("NO_MONTHLY_SURPLUS_AFTER_PURCHASE");
    assertThat(r.decision()).isNotEqualTo("BUY_NOW");
  }

  @Test
  void emiThatDelaysGoal_reportsGoalDelay() {
    Goal goal = new Goal();
    goal.setName("Laptop fund");
    goal.setTargetAmount(bd(100000));
    goal.setCurrentAmount(bd(0));
    goal.setTargetDate(LocalDate.now().plusYears(1));

    // surplus drops 20,000 -> 10,000, so the goal takes 10 months instead of 5
    PurchaseRequest req = emi("Laptop", 120000, 0, 10000, 12);
    DecisionResponse r = engine.evaluate(req, profile, List.of(goal));

    assertThat(r.goalDelayMonths()).isEqualTo(5);
    assertThat(r.reasonCodes()).contains("GOAL_DELAY");
    assertThat(r.decision()).isEqualTo("WAIT");
  }

  // ---------- helpers ----------

  private static BigDecimal bd(long value) {
    return BigDecimal.valueOf(value);
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