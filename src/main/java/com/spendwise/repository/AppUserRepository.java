package com.spendwise.repository;

import com.spendwise.entity.AppUser;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AppUserRepository extends JpaRepository<AppUser, UUID> {
  Optional<AppUser> findByEmail(String email);
    boolean existsByEmail(String email);
  boolean existsByEmailKey(String emailKey);

  long countByDemoTrueAndDemoIpAndCreatedAtAfter(String demoIp, Instant since);
  long countByDemoTrueAndCreatedAtAfter(Instant since);
  List<AppUser> findByDemoTrueAndCreatedAtBefore(Instant before);

  // Atomic: counts one demo analysis only while the demo user is still under the limit (0 rows = limit reached).
  @Modifying(flushAutomatically = true)
  @Query("UPDATE AppUser u SET u.demoEvaluations = u.demoEvaluations + 1 WHERE u.id = :id AND u.demoEvaluations < :max")
  int consumeDemoEvaluation(@Param("id") UUID id, @Param("max") int max);
}