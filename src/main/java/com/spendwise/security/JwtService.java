package com.spendwise.security;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class JwtService {
  private final SecretKey key;
  private final long ttlMinutes;

  public JwtService(@Value("${app.jwt.secret}") String secret, @Value("${app.jwt.ttl-minutes}") long ttlMinutes) {
    this.key = signingKey(secret);
    this.ttlMinutes = ttlMinutes;
  }

  private SecretKey signingKey(String secret) {
    byte[] raw = secret.getBytes(StandardCharsets.UTF_8);
    if (raw.length >= 32) return Keys.hmacShaKeyFor(raw);
    try {
      return new SecretKeySpec(MessageDigest.getInstance("SHA-256").digest(raw), "HmacSHA256");
    } catch (Exception ex) {
      throw new IllegalStateException("Unable to initialize JWT signing key", ex);
    }
  }

  public String create(String email) {
    Instant now = Instant.now();
    return Jwts.builder()
        .subject(email)
        .issuedAt(Date.from(now))
        .expiration(Date.from(now.plusSeconds(ttlMinutes * 60)))
        .signWith(key)
        .compact();
  }

  public String subject(String token) {
    return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload().getSubject();
  }
}
