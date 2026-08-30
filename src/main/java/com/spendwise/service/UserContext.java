package com.spendwise.service;

import com.spendwise.entity.AppUser;
import com.spendwise.exception.ApiException;
import com.spendwise.repository.AppUserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

@Service
public class UserContext {
  private final AppUserRepository users;
  public UserContext(AppUserRepository users){ this.users = users; }
  public AppUser currentUser() {
    String email = String.valueOf(SecurityContextHolder.getContext().getAuthentication().getPrincipal());
    return users.findByEmail(email).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized"));
  }
}
