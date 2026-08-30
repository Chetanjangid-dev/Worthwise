package com.spendwise.entity;

import com.spendwise.model.Enums.*;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
public class FinancialProfile {
  @Id @GeneratedValue(strategy = GenerationType.UUID)
  private UUID id;
  @OneToOne(optional = false) private AppUser user;
  @Column(nullable = false) private BigDecimal monthlyIncome = BigDecimal.ZERO;
  @Column(nullable = false) private BigDecimal housingExpense = BigDecimal.ZERO;
  @Column(nullable = false) private BigDecimal foodExpense = BigDecimal.ZERO;
  @Column(nullable = false) private BigDecimal transportExpense = BigDecimal.ZERO;
  @Column(nullable = false) private BigDecimal subscriptionExpense = BigDecimal.ZERO;
  @Column(nullable = false) private BigDecimal otherExpense = BigDecimal.ZERO;
  @Column(nullable = false) private BigDecimal existingEmi = BigDecimal.ZERO;
  @Column(nullable = false) private BigDecimal currentSavings = BigDecimal.ZERO;
  @Column(nullable = false) private BigDecimal emergencyFundTarget = new BigDecimal("150000");
  @Column(nullable = false) private String currency = "INR";
  @Enumerated(EnumType.STRING) private RiskTolerance riskTolerance = RiskTolerance.MODERATE;
  @Enumerated(EnumType.STRING) private SavingPriority savingPriority = SavingPriority.GOAL_FIRST;
  @Enumerated(EnumType.STRING) private PurchasePreference purchasePreference = PurchasePreference.VALUE_OVER_BRAND;
  @Column(nullable = false) private Instant createdAt = Instant.now();
  @Column(nullable = false) private Instant updatedAt = Instant.now();
  @PreUpdate void onUpdate(){ updatedAt = Instant.now(); }

  public UUID getId(){ return id; }
  public AppUser getUser(){ return user; }
  public void setUser(AppUser user){ this.user = user; }
  public BigDecimal getMonthlyIncome(){ return monthlyIncome; }
  public void setMonthlyIncome(BigDecimal monthlyIncome){ this.monthlyIncome = monthlyIncome; }
  public BigDecimal getHousingExpense(){ return housingExpense; }
  public void setHousingExpense(BigDecimal housingExpense){ this.housingExpense = housingExpense; }
  public BigDecimal getFoodExpense(){ return foodExpense; }
  public void setFoodExpense(BigDecimal foodExpense){ this.foodExpense = foodExpense; }
  public BigDecimal getTransportExpense(){ return transportExpense; }
  public void setTransportExpense(BigDecimal transportExpense){ this.transportExpense = transportExpense; }
  public BigDecimal getSubscriptionExpense(){ return subscriptionExpense; }
  public void setSubscriptionExpense(BigDecimal subscriptionExpense){ this.subscriptionExpense = subscriptionExpense; }
  public BigDecimal getOtherExpense(){ return otherExpense; }
  public void setOtherExpense(BigDecimal otherExpense){ this.otherExpense = otherExpense; }
  public BigDecimal getExistingEmi(){ return existingEmi; }
  public void setExistingEmi(BigDecimal existingEmi){ this.existingEmi = existingEmi; }
  public BigDecimal getCurrentSavings(){ return currentSavings; }
  public void setCurrentSavings(BigDecimal currentSavings){ this.currentSavings = currentSavings; }
  public BigDecimal getEmergencyFundTarget(){ return emergencyFundTarget; }
  public void setEmergencyFundTarget(BigDecimal emergencyFundTarget){ this.emergencyFundTarget = emergencyFundTarget; }
  public String getCurrency(){ return currency; }
  public RiskTolerance getRiskTolerance(){ return riskTolerance; }
  public void setRiskTolerance(RiskTolerance riskTolerance){ this.riskTolerance = riskTolerance; }
  public SavingPriority getSavingPriority(){ return savingPriority; }
  public void setSavingPriority(SavingPriority savingPriority){ this.savingPriority = savingPriority; }
  public PurchasePreference getPurchasePreference(){ return purchasePreference; }
  public void setPurchasePreference(PurchasePreference purchasePreference){ this.purchasePreference = purchasePreference; }
  public Instant getUpdatedAt(){ return updatedAt; }
}
