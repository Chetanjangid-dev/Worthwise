package com.spendwise.controller;

import org.springframework.web.bind.annotation.*;
import java.util.Map;

// Public, unauthenticated endpoint. The Vercel frontend polls this
// to detect when the free-tier Render instance has woken up from sleep.
@RestController
@RequestMapping("/api/health")
public class HealthController {
  @GetMapping
  public Map<String, Object> health() {
    return Map.of("status", "ok", "timestamp", System.currentTimeMillis());
  }
}