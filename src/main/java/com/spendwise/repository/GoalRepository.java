package com.spendwise.repository;

import com.spendwise.entity.*;
import com.spendwise.model.Enums.GoalStatus;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GoalRepository extends JpaRepository<Goal, UUID> {
  List<Goal> findByUserAndStatusOrderByTargetDateAsc(AppUser user, GoalStatus status);
  List<Goal> findByUserOrderByTargetDateAsc(AppUser user);
  Optional<Goal> findByIdAndUser(UUID id, AppUser user);
}
