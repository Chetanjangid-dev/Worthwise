package com.spendwise.repository;

import com.spendwise.entity.*;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface ApiUsageRepository extends JpaRepository<ApiUsage, UUID> {
  Optional<ApiUsage> findByUserAndUsageMonth(AppUser user, String usageMonth);

  // Atomic "count it only if the user is still under the limit": one SQL UPDATE, so parallel requests can't overshoot.
  @Modifying(clearAutomatically = true)
  @Query("UPDATE ApiUsage u SET u.aiRequests = u.aiRequests + 1 WHERE u.user = :user AND u.usageMonth = :month AND u.aiRequests < :limit")
  int incrementAiIfUnderLimit(@Param("user") AppUser user, @Param("month") String month, @Param("limit") int limit);

  @Modifying(clearAutomatically = true)
  @Query("UPDATE ApiUsage u SET u.googleRequests = u.googleRequests + 1 WHERE u.user = :user AND u.usageMonth = :month AND u.googleRequests < :limit")
  int incrementGoogleIfUnderLimit(@Param("user") AppUser user, @Param("month") String month, @Param("limit") int limit);

  @Modifying
  @Transactional
  @Query("DELETE FROM ApiUsage u WHERE u.user = :user")
  void deleteAllByUserid(@Param("user") AppUser user);
}