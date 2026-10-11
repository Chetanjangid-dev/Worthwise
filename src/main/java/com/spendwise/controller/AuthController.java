package com.spendwise.controller;

import com.spendwise.dto.AuthDtos.*;
import com.spendwise.service.UserContext;
import com.spendwise.service.AuthService;
import com.spendwise.service.DemoService;
import com.spendwise.service.OtpService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.executable.ValidateOnExecution;

import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/auth")
public class AuthController {
  private final AuthService auth;
  private final UserContext users;
  private final DemoService demo;
  private final OtpService otp;
  public AuthController(AuthService auth, UserContext users, DemoService demo, OtpService otp){ this.auth = auth; this.users = users; this.demo = demo; this.otp = otp; }
  // Signup is two steps: 1) /register/request emails a code (no account yet), 2) /register/verify creates the account.
  @PostMapping("/register/request")
    OtpSentResponse requestRegister(@Valid @RequestBody RegisterRequest req, HttpServletRequest request){ return otp.requestSignup(req, clientIp(request)); }
  @PostMapping("/register/verify")
    AuthResponse verifyRegister(@Valid @RequestBody VerifyOtpRequest req){ return otp.verify(req); }
  /** "Try demo": creates a temporary, pre-filled demo account (limited analyses) - no signup needed. */
  @PostMapping("/demo")
    AuthResponse demo(HttpServletRequest request){ return demo.start(clientIp(request)); }
  @PostMapping("/login") 
    AuthResponse login(@Valid @RequestBody LoginRequest req){ return auth.login(req); }
  @DeleteMapping("Delete")
    void deleteacc(@Valid @RequestBody delRequest req ){  auth.deleteacc(req);}
    private static String clientIp(HttpServletRequest r) {
      String fwd = r.getHeader("X-Forwarded-For"); // set by the hosting proxy (e.g. Render)
      if (fwd != null && !fwd.isBlank()) return fwd.split(",")[0].trim();
      return r.getRemoteAddr();
    }
    @GetMapping("/me") 
    UserResponse me(){ return AuthService.toUserResponse(users.currentUser()); }
  
  }