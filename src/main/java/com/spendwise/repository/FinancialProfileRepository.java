package com.spendwise.repository;

import com.spendwise.entity.*;

import jakarta.transaction.Transactional;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FinancialProfileRepository extends JpaRepository<FinancialProfile, UUID> {
  Optional<FinancialProfile> findByUser(AppUser user);
  @Modifying
  @Transactional
  @Query("DELETE FROM  financial_profile f WHERE f.user_id = :user")
     void deleteAllByUserid(@Param("user_id") AppUser user);
}
