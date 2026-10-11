package com.spendwise;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling // used to delete expired demo accounts
public class WorthWiseApplication {
  public static void main(String[] args) {
    SpringApplication.run(WorthWiseApplication.class, args);
  }
}