package com.spendwise.entity;

import jakarta.persistence.*;
import java.util.UUID;

/** How many paid-API requests one user has made in one calendar month (one row per user per month). */
@Entity
@Table(name = "api_usage", uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "usage_month"}))
public class ApiUsage {
  @Id @GeneratedValue(strategy = GenerationType.UUID)
  private UUID id;
  @ManyToOne(optional = false) @JoinColumn(name = "user_id") private AppUser user;
  /** Month key like "2026-10". */
  @Column(name = "usage_month", nullable = false, length = 7) private String usageMonth;
  /** OpenRouter (AI explanation) requests made this month. */
  @Column(name = "ai_requests", nullable = false) private int aiRequests = 0;
  /** SerpApi / Google Shopping requests made this month. */
  @Column(name = "google_requests", nullable = false) private int googleRequests = 0;

  protected ApiUsage() {}
  public ApiUsage(AppUser user, String usageMonth) { this.user = user; this.usageMonth = usageMonth; }

  public UUID getId(){ return id; }
  public AppUser getUser(){ return user; }
  public String getUsageMonth(){ return usageMonth; }
  public int getAiRequests(){ return aiRequests; }
  public int getGoogleRequests(){ return googleRequests; }
}