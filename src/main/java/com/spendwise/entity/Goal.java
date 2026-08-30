package com.spendwise.entity;

import com.spendwise.model.Enums.*;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Entity
public class Goal {
  @Id @GeneratedValue(strategy = GenerationType.UUID)
  private UUID id;
  @ManyToOne(optional = false) private AppUser user;
  @Column(nullable = false) private String name;
  @Column(nullable = false) private BigDecimal targetAmount;
  @Column(nullable = false) private BigDecimal currentAmount = BigDecimal.ZERO;
  @Column(nullable = false) private LocalDate targetDate;
  @Enumerated(EnumType.STRING) private Priority priority = Priority.MEDIUM;
  @Enumerated(EnumType.STRING) private GoalStatus status = GoalStatus.ACTIVE;

  public UUID getId(){ return id; }
  public AppUser getUser(){ return user; }
  public void setUser(AppUser user){ this.user = user; }
  public String getName(){ return name; }
  public void setName(String name){ this.name = name; }
  public BigDecimal getTargetAmount(){ return targetAmount; }
  public void setTargetAmount(BigDecimal targetAmount){ this.targetAmount = targetAmount; }
  public BigDecimal getCurrentAmount(){ return currentAmount; }
  public void setCurrentAmount(BigDecimal currentAmount){ this.currentAmount = currentAmount; }
  public LocalDate getTargetDate(){ return targetDate; }
  public void setTargetDate(LocalDate targetDate){ this.targetDate = targetDate; }
  public Priority getPriority(){ return priority; }
  public void setPriority(Priority priority){ this.priority = priority; }
  public GoalStatus getStatus(){ return status; }
  public void setStatus(GoalStatus status){ this.status = status; }
}
