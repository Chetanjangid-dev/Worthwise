package com.spendwise.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * TEMPORARY - ONE-TIME CLEANUP. DELETE THIS FILE AFTER IT HAS RUN.
 *
 * Deletes ALL users and everything linked to them (profiles, goals, purchase decisions, API usage, pending OTP signups).
 *
 * Safety: it does nothing unless the environment variable APP_WIPE_ALL_DATA=true is set.
 * So if you forget to delete this file, your data is still safe as long as that variable is not set.
 */
@Component
@ConditionalOnProperty(name = "app.wipe-all-data", havingValue = "true")
public class TempWipeAllData implements CommandLineRunner {
  private static final Logger log = LoggerFactory.getLogger(TempWipeAllData.class);

  private final JdbcTemplate jdbc;

  public TempWipeAllData(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  @Override
  public void run(String... args) {
    Integer before = jdbc.queryForObject("SELECT count(*) FROM users", Integer.class);
    log.warn("[WIPE] APP_WIPE_ALL_DATA is true. Deleting ALL users and related data. Users before: {}", before);

    // One statement = atomic: either everything is deleted or nothing is.
    jdbc.execute("TRUNCATE TABLE api_usage, purchase_decision, goal, financial_profile, users, email_otp RESTART IDENTITY CASCADE");

    Integer after = jdbc.queryForObject("SELECT count(*) FROM users", Integer.class);
    log.warn("[WIPE] Done. Users now: {}. NOW REMOVE APP_WIPE_ALL_DATA and delete TempWipeAllData.java", after);
  }
}