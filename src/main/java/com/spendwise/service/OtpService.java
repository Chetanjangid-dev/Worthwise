package com.spendwise.service;

import com.spendwise.dto.AuthDtos.*;
import com.spendwise.entity.EmailOtp;
import com.spendwise.exception.ApiException;
import com.spendwise.model.Enums.Gender;
import com.spendwise.repository.AppUserRepository;
import com.spendwise.repository.EmailOtpRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Email-OTP signup. Step 1 (requestSignup): validate, store a pending signup and email a 6-digit code.
 * Step 2 (verify): only a correct code creates the real account.
 * Protections: 60s cooldown + 5 codes/day per email, 10 codes/hour per IP, codes expire after 10 minutes,
 * 5 wrong guesses lock the code, disposable email domains are refused, Gmail aliases count as one address.
 */
@Service
public class OtpService {
  public static final int EXPIRY_MINUTES = 10;
  static final int COOLDOWN_SECONDS = 60;
  private static final int MAX_SENDS_PER_DAY = 5;
  private static final int MAX_SENDS_PER_IP_PER_HOUR = 10;
  private static final int MAX_WRONG_ATTEMPTS = 5;

  private static final Set<String> DISPOSABLE = Set.of(
      "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "10minutemail.com", "10minutemail.net",
      "tempmail.com", "temp-mail.org", "yopmail.com", "trashmail.com", "getnada.com", "maildrop.cc", "dispostable.com",
      "fakeinbox.com", "throwawaymail.com", "mohmal.com", "emailondeck.com", "tempail.com", "mintemail.com");

  private final SecureRandom random = new SecureRandom();
  private final EmailOtpRepository otps;
  private final AppUserRepository users;
  private final PasswordEncoder encoder;
  private final EmailService email;
  private final AuthService auth;
  private final byte[] hmacKey;

  public OtpService(EmailOtpRepository otps, AppUserRepository users, PasswordEncoder encoder, EmailService email,
      AuthService auth, @Value("${app.jwt.secret}") String secret) {
    this.otps = otps; this.users = users; this.encoder = encoder; this.email = email; this.auth = auth;
    this.hmacKey = secret.getBytes(StandardCharsets.UTF_8);
  }

  /** Step 1: store the pending signup and email a code. Also used for "Resend code" (same cooldown and limits). */
  @Transactional
  public OtpSentResponse requestSignup(RegisterRequest req, String ip) {
    String addr = req.email().trim().toLowerCase();
    String key = canonical(addr);
    if (DISPOSABLE.contains(addr.substring(addr.indexOf('@') + 1)))
      throw new ApiException(HttpStatus.BAD_REQUEST, "Temporary / disposable email addresses can't be used. Please use your real email.");
    try { Gender.valueOf(req.gender().trim().toUpperCase()); }
    catch (IllegalArgumentException ex) { throw new ApiException(HttpStatus.BAD_REQUEST, "Gender must be MALE, FEMALE or OTHER"); }
    if (users.existsByEmail(addr) || users.existsByEmailKey(key))
      throw new ApiException(HttpStatus.CONFLICT, "Email already registered plz try a different one");

    Instant now = Instant.now();
    if (ip != null && otps.countByRequestIpAndLastSentAtAfter(ip, now.minus(Duration.ofHours(1))) >= MAX_SENDS_PER_IP_PER_HOUR)
      throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many verification requests from your network. Please try again in an hour.");

    EmailOtp row = otps.findByEmail(addr).orElseGet(EmailOtp::new);
    if (row.getId() != null) {
      long since = Duration.between(row.getLastSentAt(), now).getSeconds();
      if (since < COOLDOWN_SECONDS)
        throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Please wait " + (COOLDOWN_SECONDS - since) + " seconds before requesting another code.");
      if (row.getWindowStart().isBefore(now.minus(Duration.ofHours(24)))) { row.setWindowStart(now); row.setSendCount(0); }
      if (row.getSendCount() >= MAX_SENDS_PER_DAY)
        throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many codes requested for this email today. Please try again tomorrow.");
    } else {
      row.setWindowStart(now);
    }

    String otp = String.format("%06d", random.nextInt(1_000_000));
    row.setEmail(addr);
    row.setEmailKey(key);
    row.setOtpHash(hash(addr, otp));
    row.setPasswordHash(encoder.encode(req.password()));
    row.setName(req.name().trim());
    row.setGender(req.gender().trim().toUpperCase());
    row.setRequestIp(ip);
    row.setAttempts(0);
    row.setSendCount(row.getSendCount() + 1);
    row.setLastSentAt(now);
    row.setExpiresAt(now.plus(Duration.ofMinutes(EXPIRY_MINUTES)));
    otps.saveAndFlush(row);
    email.sendOtp(addr, otp); // if sending fails this throws and the whole request is rolled back (nothing counted)
    return new OtpSentResponse("We sent a 6-digit code to " + addr + ".", COOLDOWN_SECONDS, EXPIRY_MINUTES);
  }

  /** Step 2: a correct code creates the account. Wrong guesses are counted even though the request fails. */
  @Transactional(noRollbackFor = ApiException.class)
  public AuthResponse verify(VerifyOtpRequest req) {
    String addr = req.email().trim().toLowerCase();
    EmailOtp row = otps.findByEmail(addr)
        .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "No pending signup for this email. Please start again."));
    if (row.getExpiresAt().isBefore(Instant.now()))
      throw new ApiException(HttpStatus.BAD_REQUEST, "This code has expired. Please request a new one.");
    if (row.getAttempts() >= MAX_WRONG_ATTEMPTS)
      throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many wrong attempts. Please request a new code.");
    boolean ok = MessageDigest.isEqual(row.getOtpHash().getBytes(StandardCharsets.UTF_8), hash(addr, req.otp()).getBytes(StandardCharsets.UTF_8));
    if (!ok) {
      row.setAttempts(row.getAttempts() + 1);
      otps.save(row);
      int left = MAX_WRONG_ATTEMPTS - row.getAttempts();
      throw new ApiException(HttpStatus.BAD_REQUEST, left > 0 ? "Incorrect code. " + left + " attempt(s) left." : "Incorrect code. Please request a new code.");
    }
    if (users.existsByEmail(addr) || users.existsByEmailKey(row.getEmailKey())) {
      otps.delete(row);
      throw new ApiException(HttpStatus.CONFLICT, "Email already registered plz try a different one");
    }
    AuthResponse created = auth.createVerifiedUser(row.getEmail(), row.getEmailKey(), row.getPasswordHash(), row.getName(),
        Gender.valueOf(row.getGender()));
    otps.delete(row);
    return created;
  }

  @Scheduled(fixedDelay = 3_600_000L, initialDelay = 120_000L)
  @Transactional
  public void cleanup() { otps.deleteStale(Instant.now().minus(Duration.ofDays(1))); }

  /** Gmail ignores dots and +tags, so a.b+x@gmail.com is the same mailbox as ab@gmail.com. */
  static String canonical(String email) {
    int at = email.indexOf('@');
    String local = email.substring(0, at), domain = email.substring(at + 1);
    if (domain.equals("googlemail.com")) domain = "gmail.com";
    if (domain.equals("gmail.com")) {
      int plus = local.indexOf('+');
      if (plus >= 0) local = local.substring(0, plus);
      local = local.replace(".", "");
    }
    return local + "@" + domain;
  }

  private String hash(String addr, String otp) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(hmacKey, "HmacSHA256"));
      byte[] out = mac.doFinal((addr + ":" + otp).getBytes(StandardCharsets.UTF_8));
      return java.util.HexFormat.of().formatHex(out);
    } catch (Exception e) { throw new IllegalStateException(e); }
  }
}