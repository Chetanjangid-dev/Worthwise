package com.spendwise.dto;
import jakarta.validation.constraints.*;

public final class AuthDtos {
  private AuthDtos() {}
  public record RegisterRequest(@Email @NotBlank String email, @Size(min = 8) String password,
                                 @NotBlank String name, @NotBlank String gender) {}
  public record VerifyOtpRequest(@Email @NotBlank String email, @NotBlank @Pattern(regexp = "\\d{6}", message = "must be 6 digits") String otp) {}
  public record OtpSentResponse(String message, int resendAfterSeconds, int expiresInMinutes) {}
  public record LoginRequest(@Email @NotBlank String email, @NotBlank String password) {}
   public record delRequest( @NotBlank String password) {}
  public record AuthResponse(String token, UserResponse user) {}
  public record UserResponse(String id, String email, String name, String gender, int financialHealthScore, String financialHealthLabel,
                              boolean demo, int demoEvaluationsLeft) {}
}