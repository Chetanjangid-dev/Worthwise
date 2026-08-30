package com.spendwise.service;

import com.spendwise.dto.AuthDtos.*;
import com.spendwise.entity.*;
import com.spendwise.exception.ApiException;
import com.spendwise.repository.*;
import com.spendwise.security.JwtService;
import java.math.BigDecimal;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
  private final AppUserRepository users;
  private final FinancialProfileRepository profiles;
  private final PasswordEncoder encoder;
  private final JwtService jwt;
  public AuthService(AppUserRepository users, FinancialProfileRepository profiles, PasswordEncoder encoder, JwtService jwt) {
    this.users = users; this.profiles = profiles; this.encoder = encoder; this.jwt = jwt;
  }

  @Transactional
  public AuthResponse register(RegisterRequest req) {
    if (users.existsByEmail(req.email())) throw new ApiException(HttpStatus.CONFLICT, "Email already registered");
    AppUser user = new AppUser();
    user.setEmail(req.email().toLowerCase());
    user.setPasswordHash(encoder.encode(req.password()));
    users.save(user);
    FinancialProfile profile = new FinancialProfile();
    profile.setUser(user);
    profiles.save(profile);
    return response(user);
  }

  public AuthResponse login(LoginRequest req) {
    AppUser user = users.findByEmail(req.email().toLowerCase())
        .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));
    if (!encoder.matches(req.password(), user.getPasswordHash())) throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
    return response(user);
  }

  private AuthResponse response(AppUser user) {
    return new AuthResponse(jwt.create(user.getEmail()), toUserResponse(user));
  }
  public static UserResponse toUserResponse(AppUser user) {
    return new UserResponse(user.getId().toString(), user.getEmail(), localName(user.getEmail()), 0, "Set up profile");
  }
  public static String localName(String email){ return email.split("@")[0]; }
}
