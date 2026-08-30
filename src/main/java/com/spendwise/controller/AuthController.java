package com.spendwise.controller;

import com.spendwise.dto.AuthDtos.*;
import com.spendwise.service.UserContext;
import com.spendwise.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/auth")
public class AuthController {
  private final AuthService auth;
  private final UserContext users;
  public AuthController(AuthService auth, UserContext users){ this.auth = auth; this.users = users; }
  @PostMapping("/register") AuthResponse register(@Valid @RequestBody RegisterRequest req){ return auth.register(req); }
  @PostMapping("/login") AuthResponse login(@Valid @RequestBody LoginRequest req){ return auth.login(req); }
  @GetMapping("/me") UserResponse me(){ return AuthService.toUserResponse(users.currentUser()); }
}
