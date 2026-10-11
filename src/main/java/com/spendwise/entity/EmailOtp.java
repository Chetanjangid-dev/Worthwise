package com.spendwise.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/**
 * A signup waiting for email verification. No real account exists yet: the account is only created
 * once the user enters the correct OTP. One row per email address.
 */
@Entity
@Table(name = "email_otp", uniqueConstraints = @UniqueConstraint(columnNames = "email"))
public class EmailOtp {
  @Id @GeneratedValue(strategy = GenerationType.UUID)
  private UUID id;
  @Column(nullable = false) private String email;
  @Column(nullable = false) private String emailKey;      // canonical form (gmail dots / +tags removed)
  @Column(nullable = false) private String otpHash;       // never the OTP itself
  @Column(nullable = false) private String passwordHash;  // bcrypt of the password the user chose
  @Column(nullable = false) private String name;
  @Column(nullable = false) private String gender;
  private String requestIp;
  @Column(nullable = false) private int attempts = 0;     // wrong OTP guesses for the current code
  @Column(nullable = false) private int sendCount = 0;    // codes sent in the current 24h window
  @Column(nullable = false) private Instant windowStart = Instant.now();
  @Column(nullable = false) private Instant lastSentAt = Instant.now();
  @Column(nullable = false) private Instant expiresAt = Instant.now();
  @Column(nullable = false) private Instant createdAt = Instant.now();

  public UUID getId(){ return id; }
  public String getEmail(){ return email; }
  public void setEmail(String email){ this.email = email; }
  public String getEmailKey(){ return emailKey; }
  public void setEmailKey(String emailKey){ this.emailKey = emailKey; }
  public String getOtpHash(){ return otpHash; }
  public void setOtpHash(String otpHash){ this.otpHash = otpHash; }
  public String getPasswordHash(){ return passwordHash; }
  public void setPasswordHash(String passwordHash){ this.passwordHash = passwordHash; }
  public String getName(){ return name; }
  public void setName(String name){ this.name = name; }
  public String getGender(){ return gender; }
  public void setGender(String gender){ this.gender = gender; }
  public String getRequestIp(){ return requestIp; }
  public void setRequestIp(String requestIp){ this.requestIp = requestIp; }
  public int getAttempts(){ return attempts; }
  public void setAttempts(int attempts){ this.attempts = attempts; }
  public int getSendCount(){ return sendCount; }
  public void setSendCount(int sendCount){ this.sendCount = sendCount; }
  public Instant getWindowStart(){ return windowStart; }
  public void setWindowStart(Instant windowStart){ this.windowStart = windowStart; }
  public Instant getLastSentAt(){ return lastSentAt; }
  public void setLastSentAt(Instant lastSentAt){ this.lastSentAt = lastSentAt; }
  public Instant getExpiresAt(){ return expiresAt; }
  public void setExpiresAt(Instant expiresAt){ this.expiresAt = expiresAt; }
  public Instant getCreatedAt(){ return createdAt; }
}