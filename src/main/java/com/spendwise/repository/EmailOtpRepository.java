package com.spendwise.repository;

import com.spendwise.entity.EmailOtp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EmailOtpRepository extends JpaRepository<EmailOtp, UUID> {
  Optional<EmailOtp> findByEmail(String email);
  long countByRequestIpAndLastSentAtAfter(String requestIp, Instant since);

  @Modifying
  @Query("DELETE FROM EmailOtp o WHERE o.lastSentAt < :before")
  int deleteStale(@Param("before") Instant before);
}