package com.spendwise.service;

import com.spendwise.dto.ApiDtos.*;
import com.spendwise.entity.AppUser;
import com.spendwise.repository.PurchaseDecisionRepository;
import org.springframework.stereotype.Service;

@Service
public class DashboardService {
  private final ProfileService profiles; private final GoalService goals; private final PurchaseService purchases;
  public DashboardService(ProfileService profiles, GoalService goals, PurchaseService purchases, PurchaseDecisionRepository ignored) {
    this.profiles = profiles; this.goals = goals; this.purchases = purchases;
  }
  public DashboardResponse get(AppUser user) {
    return new DashboardResponse(profiles.get(user), goals.list(user), purchases.history(user).stream().limit(5).toList());
  }
}
