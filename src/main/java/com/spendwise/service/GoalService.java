package com.spendwise.service;

import com.spendwise.dto.ApiDtos.*;
import com.spendwise.entity.*;
import com.spendwise.exception.ApiException;
import com.spendwise.model.Enums.GoalStatus;
import com.spendwise.repository.GoalRepository;
import java.math.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GoalService {
  private final GoalRepository goals;
  public GoalService(GoalRepository goals){ this.goals = goals; }
  public List<Goal> active(AppUser user){ return goals.findByUserAndStatusOrderByTargetDateAsc(user, GoalStatus.ACTIVE); }
  public List<GoalResponse> list(AppUser user){ return goals.findByUserOrderByTargetDateAsc(user).stream().map(this::toResponse).toList(); }

  @Transactional public GoalResponse create(AppUser user, GoalRequest req) {
    Goal g = new Goal();
    g.setUser(user); apply(g, req);
    return toResponse(goals.save(g));
  }
  @Transactional public GoalResponse update(AppUser user, UUID id, GoalRequest req) {
    Goal g = goals.findByIdAndUser(id, user).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Goal not found"));
    apply(g, req); return toResponse(g);
  }
  @Transactional public void delete(AppUser user, UUID id) {
    Goal g = goals.findByIdAndUser(id, user).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Goal not found"));
    goals.delete(g);
  }
  private void apply(Goal g, GoalRequest req) {
    g.setName(req.name()); g.setTargetAmount(req.targetAmount());
    g.setCurrentAmount(req.currentAmount() == null ? BigDecimal.ZERO : req.currentAmount());
    g.setTargetDate(req.targetDate());
    if (req.priority() != null) g.setPriority(req.priority());
  }
  public GoalResponse toResponse(Goal g) {
    BigDecimal remaining = g.getTargetAmount().subtract(g.getCurrentAmount()).max(BigDecimal.ZERO);
    long months = Math.max(1, ChronoUnit.MONTHS.between(LocalDate.now().withDayOfMonth(1), g.getTargetDate().withDayOfMonth(1)));
    BigDecimal required = remaining.divide(BigDecimal.valueOf(months), 0, RoundingMode.CEILING);
    return new GoalResponse(g.getId().toString(), g.getName(), icon(g.getName()), g.getTargetAmount(), g.getCurrentAmount(),
        remaining, required, g.getTargetDate(), g.getPriority(), g.getStatus());
  }
  private String icon(String name) {
    String n = name.toLowerCase();
    if (n.contains("laptop")) return "laptop";
    if (n.contains("trip") || n.contains("travel")) return "plane";
    if (n.contains("course") || n.contains("skill")) return "book";
    return "shield";
  }
}
