package com.spendwise.entity;

import com.spendwise.model.Enums.*;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
public class PurchaseDecision {
  @Id @GeneratedValue(strategy = GenerationType.UUID)
  private UUID id;
  @ManyToOne(optional = false) private AppUser user;
  @Column(nullable = false) private String productName;
  @Column(nullable = false) private String category;
  @Column(nullable = false) private BigDecimal price;
  @Enumerated(EnumType.STRING) private PurchaseType purchaseType = PurchaseType.ONE_TIME;
  private BigDecimal monthlyEmi = BigDecimal.ZERO;
  private Integer durationMonths;
  @Column(length = 1000) private String reason;
  private String productUrl;
  @Enumerated(EnumType.STRING) private Decision decision;
  private int score;
  private BigDecimal savingsAfterPurchase;
  private BigDecimal monthlySurplusBefore;
  private BigDecimal monthlySurplusAfterPurchase;
  private BigDecimal safePriceMin;
  private BigDecimal safePriceMax;
  private int recommendedWaitMonths;
  private String goalName;
  private int goalDelayMonths;
  private LocalDate goalCompletionDate;
  @Column(length = 2000) private String reasonCodes;
  @Column(length = 4000) private String explanation;
  @Column(nullable = false) private Instant createdAt = Instant.now();

  public UUID getId(){ return id; }
  public AppUser getUser(){ return user; }
  public void setUser(AppUser user){ this.user = user; }
  public String getProductName(){ return productName; }
  public void setProductName(String productName){ this.productName = productName; }
  public String getCategory(){ return category; }
  public void setCategory(String category){ this.category = category; }
  public BigDecimal getPrice(){ return price; }
  public void setPrice(BigDecimal price){ this.price = price; }
  public PurchaseType getPurchaseType(){ return purchaseType; }
  public void setPurchaseType(PurchaseType purchaseType){ this.purchaseType = purchaseType; }
  public BigDecimal getMonthlyEmi(){ return monthlyEmi; }
  public void setMonthlyEmi(BigDecimal monthlyEmi){ this.monthlyEmi = monthlyEmi; }
  public Integer getDurationMonths(){ return durationMonths; }
  public void setDurationMonths(Integer durationMonths){ this.durationMonths = durationMonths; }
  public String getReason(){ return reason; }
  public void setReason(String reason){ this.reason = reason; }
  public String getProductUrl(){ return productUrl; }
  public void setProductUrl(String productUrl){ this.productUrl = productUrl; }
  public Decision getDecision(){ return decision; }
  public void setDecision(Decision decision){ this.decision = decision; }
  public int getScore(){ return score; }
  public void setScore(int score){ this.score = score; }
  public BigDecimal getSavingsAfterPurchase(){ return savingsAfterPurchase; }
  public void setSavingsAfterPurchase(BigDecimal savingsAfterPurchase){ this.savingsAfterPurchase = savingsAfterPurchase; }
  public BigDecimal getMonthlySurplusBefore(){ return monthlySurplusBefore; }
  public void setMonthlySurplusBefore(BigDecimal monthlySurplusBefore){ this.monthlySurplusBefore = monthlySurplusBefore; }
  public BigDecimal getMonthlySurplusAfterPurchase(){ return monthlySurplusAfterPurchase; }
  public void setMonthlySurplusAfterPurchase(BigDecimal monthlySurplusAfterPurchase){ this.monthlySurplusAfterPurchase = monthlySurplusAfterPurchase; }
  public BigDecimal getSafePriceMin(){ return safePriceMin; }
  public void setSafePriceMin(BigDecimal safePriceMin){ this.safePriceMin = safePriceMin; }
  public BigDecimal getSafePriceMax(){ return safePriceMax; }
  public void setSafePriceMax(BigDecimal safePriceMax){ this.safePriceMax = safePriceMax; }
  public int getRecommendedWaitMonths(){ return recommendedWaitMonths; }
  public void setRecommendedWaitMonths(int recommendedWaitMonths){ this.recommendedWaitMonths = recommendedWaitMonths; }
  public String getGoalName(){ return goalName; }
  public void setGoalName(String goalName){ this.goalName = goalName; }
  public int getGoalDelayMonths(){ return goalDelayMonths; }
  public void setGoalDelayMonths(int goalDelayMonths){ this.goalDelayMonths = goalDelayMonths; }
  public LocalDate getGoalCompletionDate(){ return goalCompletionDate; }
  public void setGoalCompletionDate(LocalDate goalCompletionDate){ this.goalCompletionDate = goalCompletionDate; }
  public String getReasonCodes(){ return reasonCodes; }
  public void setReasonCodes(String reasonCodes){ this.reasonCodes = reasonCodes; }
  public String getExplanation(){ return explanation; }
  public void setExplanation(String explanation){ this.explanation = explanation; }
  public Instant getCreatedAt(){ return createdAt; }
}
