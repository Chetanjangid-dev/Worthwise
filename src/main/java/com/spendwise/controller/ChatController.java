package com.spendwise.controller;

import com.spendwise.dto.ChatDtos.*;
import com.spendwise.service.ChatService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

/** Public endpoint (the chatbot also works for visitors who are not logged in). */
@RestController @RequestMapping("/api/chat")
public class ChatController {
  private final ChatService chat;
  public ChatController(ChatService chat) { this.chat = chat; }

  @PostMapping
  ChatResponse chat(@RequestBody ChatRequest req, HttpServletRequest http) {
    String fwd = http.getHeader("X-Forwarded-For"); // Render / proxies put the real client IP here
    String ip = (fwd != null && !fwd.isBlank()) ? fwd.split(",")[0].trim() : http.getRemoteAddr();
    return chat.reply(req, ip);
  }
}