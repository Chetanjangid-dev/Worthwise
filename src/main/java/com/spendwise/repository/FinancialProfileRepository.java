package com.spendwise.repository;

import com.spendwise.entity.*;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FinancialProfileRepository extends JpaRepository<FinancialProfile, UUID> {
  Optional<FinancialProfile> findByUser(AppUser user);
}
