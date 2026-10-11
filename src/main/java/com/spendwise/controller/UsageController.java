package com.spendwise.controller;

import com.spendwise.dto.ApiDtos.ApiUsageResponse;
import com.spendwise.service.*;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/usage")
public class UsageController {
  private final UserContext users; private final ApiUsageService usage;
  public UsageController(UserContext users, ApiUsageService usage){ this.users = users; this.usage = usage; }
  @GetMapping ApiUsageResponse get(){ return usage.usageFor(users.currentUser()); }
}