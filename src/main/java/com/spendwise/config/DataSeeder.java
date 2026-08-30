package com.spendwise.config;

import com.spendwise.entity.*;
import com.spendwise.model.Enums.Priority;
import com.spendwise.repository.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
@ConditionalOnProperty(name = "app.seed-demo-data", havingValue = "true")
public class DataSeeder {
  @Bean CommandLineRunner seed(AppUserRepository users, FinancialProfileRepository profiles, GoalRepository goals, PasswordEncoder encoder) {
    return args -> {
      if (users.existsByEmail("chetan@example.com")) return;
      AppUser user = new AppUser();
      user.setEmail("chetan@example.com");
      user.setPasswordHash(encoder.encode("password123"));
      users.save(user);
      FinancialProfile p = new FinancialProfile();
      p.setUser(user); p.setMonthlyIncome(new BigDecimal("60000")); p.setHousingExpense(new BigDecimal("14000"));
      p.setFoodExpense(new BigDecimal("7000")); p.setTransportExpense(new BigDecimal("3500")); p.setSubscriptionExpense(new BigDecimal("1800"));
      p.setOtherExpense(new BigDecimal("5700")); p.setExistingEmi(new BigDecimal("4000")); p.setCurrentSavings(new BigDecimal("80000"));
      profiles.save(p);
      createGoal(goals, user, "Emergency Fund", "150000", "80000", LocalDate.of(2027, 1, 15), Priority.HIGH);
      createGoal(goals, user, "New Laptop", "85000", "52700", LocalDate.of(2027, 3, 1), Priority.MEDIUM);
      createGoal(goals, user, "Goa Trip", "45000", "37800", LocalDate.of(2026, 12, 10), Priority.MEDIUM);
    };
  }
  private static void createGoal(GoalRepository repo, AppUser user, String name, String target, String current, LocalDate date, Priority priority) {
    Goal g = new Goal(); g.setUser(user); g.setName(name); g.setTargetAmount(new BigDecimal(target)); g.setCurrentAmount(new BigDecimal(current));
    g.setTargetDate(date); g.setPriority(priority); repo.save(g);
  }
}
