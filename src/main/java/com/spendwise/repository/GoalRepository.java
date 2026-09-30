package com.spendwise.repository;

import com.spendwise.entity.*;
import com.spendwise.model.Enums.GoalStatus;

import jakarta.persistence.Id;
import jakarta.transaction.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GoalRepository extends JpaRepository<Goal, UUID> {
  List<Goal> findByUserAndStatusOrderByTargetDateAsc(AppUser user, GoalStatus status);
  List<Goal> findByUserOrderByTargetDateAsc(AppUser user);
  Optional<Goal> findByIdAndUser(UUID id, AppUser user);
  @Modifying
  @Transactional
  @Query("DELETE FROM Goal g WHERE g.user_id = :user")
     void deleteAllByUserid(@Param("user_id") AppUser user);
}
