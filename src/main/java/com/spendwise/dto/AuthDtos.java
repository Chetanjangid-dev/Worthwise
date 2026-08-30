package com.spendwise.dto;

import jakarta.validation.constraints.*;

public final class AuthDtos {
  private AuthDtos() {}
  public record RegisterRequest(@Email @NotBlank String email, @Size(min = 8) String password) {}
  public record LoginRequest(@Email @NotBlank String email, @NotBlank String password) {}
  public record AuthResponse(String token, UserResponse user) {}
  public record UserResponse(String id, String email, String name, int financialHealthScore, String financialHealthLabel) {}
}
