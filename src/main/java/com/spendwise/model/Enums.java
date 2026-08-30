package com.spendwise.model;

public final class Enums {
  private Enums() {}

  public enum Decision { BUY_NOW, WAIT, DONT_BUY, CONSIDER_ALTERNATIVE }
  public enum PurchaseType { ONE_TIME, EMI }
  public enum Priority { LOW, MEDIUM, HIGH }
  public enum GoalStatus { ACTIVE, COMPLETED, PAUSED }
  public enum RiskTolerance { LOW, MODERATE, HIGH }
  public enum SavingPriority { GOAL_FIRST, BALANCED, FLEXIBLE }
  public enum PurchasePreference { VALUE_OVER_BRAND, QUALITY_FIRST, BALANCED }
}
