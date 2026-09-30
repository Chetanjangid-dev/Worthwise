package com.spendwise.exception;

import java.util.Map;
import org.springframework.http.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice
public class GlobalExceptionHandler {
  @ExceptionHandler(ApiException.class)
  ResponseEntity<Map<String, String>> api(ApiException ex) {
    return ResponseEntity.status(ex.status()).body(Map.of("error", ex.getMessage()));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<Map<String, String>> validation(MethodArgumentNotValidException ex) {
    String details = ex.getBindingResult().getFieldErrors().stream()
        .map(e -> e.getField() + " " + e.getDefaultMessage())
        .collect(java.util.stream.Collectors.joining(", "));
    return ResponseEntity.badRequest().body(Map.of("error", details.isBlank() ? "Invalid request data" : details));
  }

  // TEMPORARY DEBUG HANDLER: returns the real cause of unexpected 500 errors so the
  // frontend popup can show it. Remove once the problem is fixed.
  @ExceptionHandler(Exception.class)
  ResponseEntity<Map<String, String>> unexpected(Exception ex) throws Exception {
    if (ex instanceof org.springframework.web.ErrorResponse er) {
      return ResponseEntity.status(er.getStatusCode()).body(Map.of("error", String.valueOf(ex.getMessage())));
    }
    ex.printStackTrace();
    Throwable root = ex;
    while (root.getCause() != null && root.getCause() != root) root = root.getCause();
    return ResponseEntity.status(500).body(Map.of("error",
        ex.getClass().getSimpleName() + ": " + String.valueOf(root.getMessage())));
  }
}