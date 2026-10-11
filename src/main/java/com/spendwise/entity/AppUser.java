package com.spendwise.entity;

import com.spendwise.model.Enums.Gender;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users", uniqueConstraints = @UniqueConstraint(columnNames = "email"))
public class AppUser {
  @Id @GeneratedValue(strategy = GenerationType.UUID)
  private UUID id;
  @Column(nullable = false) private String email;
  @Column(nullable = false) private String passwordHash;
  @Column(nullable = false) private String name;
  @Enumerated(EnumType.STRING)
  @Column(nullable = false) private Gender gender;
  @Column(nullable = false) private Instant createdAt = Instant.now();
  @Column(nullable = false) private Instant updatedAt = Instant.now();
  /** Temporary "Try demo" account: pre-filled data, limited analyses, deleted automatically after 24h. */
  @Column(nullable = false, columnDefinition = "boolean default false") private boolean demo = false;
  private String demoIp;
  /** Canonical email (Gmail dots / +tags removed) used to stop one mailbox making many accounts. Null for old accounts. */
  private String emailKey;
  @Column(nullable = false, columnDefinition = "integer default 0") private int demoEvaluations = 0;

  @PreUpdate void onUpdate(){ updatedAt = Instant.now(); }
  public UUID getId(){ return id; }
  public String getEmail(){ return email; }
  public void setEmail(String email){ this.email = email; }
  public String getPasswordHash(){ return passwordHash; }
  public void setPasswordHash(String passwordHash){ this.passwordHash = passwordHash; }
  public String getName(){ return name; }
  public void setName(String name){ this.name = name; }
  public Gender getGender(){ return gender; }
  public void setGender(Gender gender){ this.gender = gender; }
  public Instant getCreatedAt(){ return createdAt; }
  public Instant getUpdatedAt(){ return updatedAt; }
  public String getEmailKey(){ return emailKey; }
  public void setEmailKey(String emailKey){ this.emailKey = emailKey; }
  public boolean isDemo(){ return demo; }
  public void setDemo(boolean demo){ this.demo = demo; }
  public String getDemoIp(){ return demoIp; }
  public void setDemoIp(String demoIp){ this.demoIp = demoIp; }
  public int getDemoEvaluations(){ return demoEvaluations; }
}