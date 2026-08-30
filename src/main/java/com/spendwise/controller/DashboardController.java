package com.spendwise.controller;

import com.spendwise.dto.ApiDtos.DashboardResponse;
import com.spendwise.service.*;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/dashboard")
public class DashboardController {
  private final UserContext users; private final DashboardService dashboard;
  public DashboardController(UserContext users, DashboardService dashboard){ this.users = users; this.dashboard = dashboard; }
  @GetMapping DashboardResponse get(){ return dashboard.get(users.currentUser()); }
}
