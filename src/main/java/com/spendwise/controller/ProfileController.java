package com.spendwise.controller;

import com.spendwise.dto.ApiDtos.*;
import com.spendwise.service.*;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/profile")
public class ProfileController {
  private final UserContext users; private final ProfileService profiles;
  public ProfileController(UserContext users, ProfileService profiles){ this.users = users; this.profiles = profiles; }
  @GetMapping ProfileResponse get(){ return profiles.get(users.currentUser()); }
  @PutMapping ProfileResponse update(@Valid @RequestBody ProfileRequest req){ return profiles.update(users.currentUser(), req); }
}
