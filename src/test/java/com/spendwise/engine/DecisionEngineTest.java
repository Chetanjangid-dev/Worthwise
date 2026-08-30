package com.spendwise.engine;

import static org.assertj.core.api.Assertions.assertThat;

import com.spendwise.dto.ApiDtos.PurchaseRequest;
import com.spendwise.entity.*;
import com.spendwise.model.Enums.PurchaseType;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class DecisionEngineTest {
  private final DecisionEngine engine = new DecisionEngine();

  @Test
  void comfortablePurchaseCanBuyNow() {
    var result = engine.evaluate(purchase("Gym", "Health & Fitness", "12000"), profile("60000", "80000", "30000"), List.of(goal()));
    assertThat(result.decision()).isEqualTo("BUY_NOW");
    assertThat(result.reasonCodes()).doesNotContain("INSUFFICIENT_SAVINGS");
  }

  @Test
  void emergencyFundViolationRecommendsAlternativeOrWaiting() {
    var result = engine.evaluate(purchase("Headphones", "Electronics", "12000"), profile("20000", "25000", "20000"), List.of(goal()));
    assertThat(result.reasonCodes()).contains("BELOW_EMERGENCY_FUND");
    assertThat(result.decision()).isIn("WAIT", "CONSIDER_ALTERNATIVE");
  }

  @Test
  void purchaseAboveSavingsIsRejected() {
    var result = engine.evaluate(purchase("Laptop", "Electronics", "90000"), profile("30000", "25000", "15000"), List.of(goal()));
    assertThat(result.decision()).isEqualTo("DONT_BUY");
    assertThat(result.reasonCodes()).contains("INSUFFICIENT_SAVINGS");
  }

  @Test
  void lowDisposableIncomeIsFlagged() {
    FinancialProfile p = profile("25000", "100000", "30000");
    p.setHousingExpense(new BigDecimal("24000"));
    var result = engine.evaluate(purchase("Phone", "Electronics", "10000"), p, List.of(goal()));
    assertThat(result.reasonCodes()).contains("NO_MONTHLY_SURPLUS_AFTER_PURCHASE");
  }

  @Test
  void emiCanDelayGoal() {
    var result = engine.evaluate(new PurchaseRequest("Laptop", "Laptop", "Electronics", new BigDecimal("40000"),
        PurchaseType.EMI, new BigDecimal("5000"), 12, "Work", null), profile("60000", "100000", "30000"), List.of(goal()));
    assertThat(result.goalDelayMonths()).isGreaterThanOrEqualTo(0);
    assertThat(result.monthlySurplusAfterPurchase()).isLessThan(result.monthlySurplusBefore());
  }

  private PurchaseRequest purchase(String name, String category, String price) {
    return new PurchaseRequest(name, name, category, new BigDecimal(price), PurchaseType.ONE_TIME, BigDecimal.ZERO, null, null, null);
  }

  private FinancialProfile profile(String income, String savings, String emergencyTarget) {
    AppUser user = new AppUser();
    user.setEmail("test@example.com");
    FinancialProfile p = new FinancialProfile();
    p.setUser(user);
    p.setMonthlyIncome(new BigDecimal(income));
    p.setCurrentSavings(new BigDecimal(savings));
    p.setEmergencyFundTarget(new BigDecimal(emergencyTarget));
    p.setHousingExpense(new BigDecimal("10000"));
    p.setFoodExpense(new BigDecimal("5000"));
    return p;
  }

  private Goal goal() {
    AppUser user = new AppUser();
    user.setEmail("test@example.com");
    Goal g = new Goal();
    g.setUser(user);
    g.setName("Emergency Fund");
    g.setTargetAmount(new BigDecimal("150000"));
    g.setCurrentAmount(new BigDecimal("80000"));
    g.setTargetDate(LocalDate.now().plusMonths(8));
    return g;
  }
}
