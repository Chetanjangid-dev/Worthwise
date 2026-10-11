package com.spendwise.service;

import com.spendwise.exception.ApiException;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

/**
 * Sends the verification email through Brevo's HTTPS API (free plan: 300 emails/day, no domain needed -
 * just verify one sender address in Brevo). An HTTP API is used instead of SMTP because free hosts such as Render block SMTP.
 */
@Service
public class EmailService {
  private static final Logger log = LoggerFactory.getLogger(EmailService.class);
  private static final String SEND_FAILED_MSG =
      "We couldn't send the verification email. Please check the address and try again.";

  private final String apiKey;
  private final String fromEmail;
  private final String fromName;
  private final boolean devLog;
  private final WebClient webClient = WebClient.builder().baseUrl("https://api.brevo.com/v3").build();

  public EmailService(@Value("${app.mail.brevo-api-key:}") String apiKey,
      @Value("${app.mail.from-email:}") String fromEmail,
      @Value("${app.mail.from-name:Worthwise}") String fromName,
      @Value("${app.otp.dev-log:false}") boolean devLog) {
    // Trim + strip quotes: stray spaces/quotes pasted into env vars are a very common cause of 401/400 errors.
    this.apiKey = clean(apiKey);
    this.fromEmail = extractEmail(clean(fromEmail));
    this.fromName = (fromName == null || fromName.isBlank()) ? "Worthwise" : clean(fromName);
    this.devLog = devLog;

    // Safe startup diagnostics (never prints the key itself).
    log.info("[Email] Brevo API key present: {} | sender email: {} | dev-log: {}",
        !this.apiKey.isBlank(), this.fromEmail.isBlank() ? "(missing)" : this.fromEmail, devLog);
    if (!this.apiKey.isBlank() && !this.apiKey.startsWith("xkeysib-")) {
      log.warn("[Email] BREVO_API_KEY does not start with 'xkeysib-'. Make sure you copied the API key (not an SMTP key).");
    }
  }

  public void sendOtp(String toEmail, String otp) {
    boolean configured = !apiKey.isBlank() && !fromEmail.isBlank();
    if (!configured) {
      if (devLog) { // local development only: lets you test without an email account
        log.warn("[OTP-DEV] Email service not configured. OTP for {} is {}", toEmail, otp);
        return;
      }
      log.error("[Email] BREVO_API_KEY / MAIL_FROM_EMAIL not configured - cannot send verification emails.");
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Email verification is temporarily unavailable. Please try again later.");
    }

    String html = "<div style=\"font-family:Arial,sans-serif;font-size:15px;color:#222\">"
        + "<p>Your Worthwise verification code is:</p>"
        + "<p style=\"font-size:30px;font-weight:bold;letter-spacing:6px;margin:12px 0\">" + otp + "</p>"
        + "<p>This code expires in " + OtpService.EXPIRY_MINUTES + " minutes. If you didn't try to create a Worthwise account, you can ignore this email.</p>"
        + "</div>";
    Map<String, Object> body = Map.of(
        "sender", Map.of("name", fromName, "email", fromEmail),
        "to", List.of(Map.of("email", toEmail)),
        "subject", "Your Worthwise verification code: " + otp,
        "htmlContent", html);

    try {
      webClient.post().uri("/smtp/email")
          .header("api-key", apiKey)
          .header("Content-Type", "application/json")
          .header("accept", "application/json")
          .bodyValue(body).retrieve().toBodilessEntity()
          .block(java.time.Duration.ofSeconds(10));
    } catch (WebClientResponseException e) {
      // Brevo answered with an error: log its status and message (contains no API key and no OTP).
      log.error("[Email] Brevo rejected the request: status={} body={}", e.getStatusCode(), e.getResponseBodyAsString());
      throw new ApiException(HttpStatus.BAD_GATEWAY, SEND_FAILED_MSG);
    } catch (Exception e) {
      // Network / timeout / other. Log only the exception type and message: never the API key or the OTP.
      log.error("[Email] Sending the verification email failed ({}): {}", e.getClass().getSimpleName(), e.getMessage());
      throw new ApiException(HttpStatus.BAD_GATEWAY, SEND_FAILED_MSG);
    }
  }

  /** Trims whitespace and surrounding quotes that sometimes get pasted into environment variables. */
  private static String clean(String v) {
    if (v == null) return "";
    String s = v.trim();
    if (s.length() >= 2 && ((s.startsWith("\"") && s.endsWith("\"")) || (s.startsWith("'") && s.endsWith("'")))) {
      s = s.substring(1, s.length() - 1).trim();
    }
    return s;
  }

  /** Accepts either "me@gmail.com" or "Name <me@gmail.com>" and returns just the address. */
  private static String extractEmail(String v) {
    int lt = v.indexOf('<'), gt = v.indexOf('>');
    if (lt >= 0 && gt > lt) return v.substring(lt + 1, gt).trim();
    return v;
  }
}