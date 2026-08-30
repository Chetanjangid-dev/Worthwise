package com.spendwise.controller;

import com.spendwise.dto.ApiDtos.*;
import com.spendwise.service.*;
import jakarta.validation.Valid;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/goals")
public class GoalController {
  private final UserContext users; private final GoalService goals;
  public GoalController(UserContext users, GoalService goals){ this.users = users; this.goals = goals; }
  @GetMapping List<GoalResponse> list(){ return goals.list(users.currentUser()); }
  @PostMapping GoalResponse create(@Valid @RequestBody GoalRequest req){ return goals.create(users.currentUser(), req); }
  @PutMapping("/{id}") GoalResponse update(@PathVariable UUID id, @Valid @RequestBody GoalRequest req){ return goals.update(users.currentUser(), id, req); }
  @DeleteMapping("/{id}") void delete(@PathVariable UUID id){ goals.delete(users.currentUser(), id); }
}
