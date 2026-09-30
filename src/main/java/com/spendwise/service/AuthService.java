package com.spendwise.service;
import com.spendwise.dto.AuthDtos.*;
import com.spendwise.entity.*;
import com.spendwise.model.Enums.Gender;
import com.spendwise.exception.ApiException;
import com.spendwise.repository.*;
import com.spendwise.security.JwtService;
import java.math.BigDecimal;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.spendwise.service.UserContext;

@Service
public class AuthService {
  private final AppUserRepository users;
  private final FinancialProfileRepository profiles;
  private final PasswordEncoder encoder;
  private final JwtService jwt;
  private final FinancialProfileRepository pfp;
  private  final GoalRepository goals;
  private  final PurchaseDecisionRepository pds;
 private  UserContext usercontext;
  public AuthService(PurchaseDecisionRepository pds, GoalRepository goals,FinancialProfileRepository pfp, AppUserRepository users, FinancialProfileRepository profiles, PasswordEncoder encoder, JwtService jwt,UserContext usercontext) {
    this.users = users; this.profiles = profiles; this.encoder = encoder; this.jwt = jwt;
    this.usercontext = usercontext;
    this.pfp =pfp;
    this.goals=goals;
    this.pds=pds;
  }

  @Transactional
  public AuthResponse register(RegisterRequest req) {
    if (users.existsByEmail(req.email())) throw new ApiException(HttpStatus.CONFLICT, "Email already registered plz try a different one");
    AppUser user = new AppUser();
    user.setEmail(req.email().toLowerCase());
    user.setPasswordHash(encoder.encode(req.password()));
    user.setName(req.name().trim());
    try {
      user.setGender(Gender.valueOf(req.gender().trim().toUpperCase()));
    } catch (IllegalArgumentException ex) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Gender must be MALE, FEMALE or OTHER");
    }
    users.save(user);
    FinancialProfile profile = new FinancialProfile();
    profile.setUser(user);
    profiles.save(profile);
    return response(user);
  }
  @Transactional 
  public void deleteacc(delRequest req){
      String password = req.password();
       //find emil from crr req this willr eturn a whole record Appusereniy
      AppUser user = usercontext.currentUser();
      if (!encoder.matches(req.password(), user.getPasswordHash())){ 
        goals.deleteAllByUserid(user);         
        pfp.deleteAllByUserid(user);
        pds.deleteAllByUserid(user);
        users.delete(user);
      }
      else{
        throw new ApiException(HttpStatus.CONFLICT, "the password is incorrect");
      }
     return ;
  }

  public AuthResponse login(LoginRequest req) {
    AppUser user = users.findByEmail(req.email().toLowerCase())
        .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "email not found"));
    if (!encoder.matches(req.password(), user.getPasswordHash())) throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid password");
    return response(user);
  }

  private AuthResponse response(AppUser user) { 
    return new AuthResponse(jwt.create(user.getEmail()), toUserResponse(user));
  }
  public static UserResponse toUserResponse(AppUser user) {
    String name = user.getName() != null ? user.getName() : localName(user.getEmail());
    String gender = user.getGender() != null ? user.getGender().name() : null;
    return new UserResponse(user.getId().toString(), user.getEmail(), name, gender, 0, "Set up profile");
  }
  public static String localName(String email){ return email.split("@")[0]; }
}