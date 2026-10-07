package com.spendwise.controller;
import com.spendwise.dto.ApiDtos.*;
import com.spendwise.service.*;
import jakarta.validation.Valid;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;

@RestController @RequestMapping("/api/purchases")
public class PurchaseController {
  private final UserContext users; private final PurchaseService purchases;
  public PurchaseController(UserContext users, PurchaseService purchases){ this.users = users; this.purchases = purchases; }
  @PostMapping("/evaluate") DecisionResponse evaluate(@Valid @RequestBody PurchaseRequest req){ return purchases.evaluate(users.currentUser(), req); }
  @GetMapping("/history") List<DecisionItem> history(){ return purchases.history(users.currentUser()); }
  @GetMapping("/revaluate/{id}") DecisionResponse revaluate(@PathVariable("id") UUID id){ return purchases.revaluate(users.currentUser(), id); } 
  @GetMapping("/{id}") DecisionItem get(@PathVariable("id") UUID id){ return purchases.get(users.currentUser(), id); }
  @DeleteMapping("/{id}") void delete(@PathVariable("id") UUID id){purchases.deletepurchase(id);}    
}