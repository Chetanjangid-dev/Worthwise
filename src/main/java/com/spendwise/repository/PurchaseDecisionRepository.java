package com.spendwise.repository;

import com.spendwise.entity.*;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PurchaseDecisionRepository extends JpaRepository<PurchaseDecision, UUID> {
  List<PurchaseDecision> findTop20ByUserOrderByCreatedAtDesc(AppUser user);
  List<PurchaseDecision> findByUserOrderByCreatedAtDesc(AppUser user);
  Optional<PurchaseDecision> findByIdAndUser(UUID id, AppUser user);
}
