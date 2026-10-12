package com.spendwise.dto;

import java.util.List;
import java.util.Map;

public final class ChatDtos {
  private ChatDtos() {}

  /** One earlier message. role is "user" or "bot". */
  public record Turn(String role, String text) {}

  public record ChatRequest(String message, List<Turn> history) {}

  /** source: "kb" (exact knowledge-base answer), "ai" (LLM answered using retrieved KB data) or "fallback". */
  public record ChatResponse(String reply, String entryId, List<Map<String, Object>> actions, List<String> next, String source) {}
}