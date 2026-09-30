package com.spendwise.repository;

import com.spendwise.entity.*;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.transaction.Transactional;
public interface PurchaseDecisionRepository extends JpaRepository<PurchaseDecision, UUID> {
  List<PurchaseDecision> findTop20ByUserOrderByCreatedAtDesc(AppUser user);
  List<PurchaseDecision> findByUserOrderByCreatedAtDesc(AppUser user);
  Optional<PurchaseDecision> findByIdAndUser(UUID id, AppUser user);
    @Modifying
    @Transactional
   @Query("DELETE FROM  PurchaseDecision pd WHERE pd.user = :user")
     void deleteAllByUserid(@Param("user") AppUser user);
   @Modifying 
   @Transactional 
   @Query("DELETE FROM PurchaseDecision pd WHERE pd.user = :user AND pd.id =:id")
     void  deletetheitemwiththisisandthisuser(@Param ("user") AppUser user ,@Param ("id") UUID id);
}
