package com.spendwise.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

/**
 * The Worthwise knowledge base (src/main/resources/chatbot-knowledge.json) and the keyword
 * retrieval over it. To teach the chatbot something new, add an entry to that JSON file.
 */
@Service
public class ChatKnowledgeService {
  private static final Logger log = LoggerFactory.getLogger(ChatKnowledgeService.class);

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record Entry(String id, List<String> k, String a, String hi, List<Map<String, Object>> act, List<String> next) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record Fallback(String a, String hi, List<String> next) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  record Kb(Fallback fallback, List<Entry> entries) {}

  public record Match(Entry entry, int score) {}

  private static final Set<String> HINGLISH = Set.of(("kaise kya hai hain karu karna kare karo mujhe mera meri mere kyu kyun nahi nahin batao bataiye batayiye chahiye "
      + "paisa paise kharcha kharch bachat kitna kitne kab kahan aap tum mein hota hoti wala wali banana banao dikhao samjhao matlab "
      + "bhai yaar shukriya dhanyavad theek accha acha kaun lagte lagta sakta sakti shuru kaam").split(" "));

  private List<Entry> entries = List.of();
  private Fallback fallback = new Fallback("I'm not sure about that one.", "Ye mujhe samajh nahi aaya.", List.of());

  @PostConstruct
  void load() {
    try (InputStream in = new ClassPathResource("chatbot-knowledge.json").getInputStream()) {
      Kb kb = new ObjectMapper().readValue(in, Kb.class);
      this.entries = kb.entries();
      if (kb.fallback() != null) this.fallback = kb.fallback();
      log.info("[Chat] Loaded {} knowledge-base entries", entries.size());
    } catch (Exception e) {
      log.error("[Chat] Could not load chatbot-knowledge.json: {}", e.getMessage());
    }
  }

  public Fallback fallback() { return fallback; }

  public Optional<Entry> byId(String id) { return entries.stream().filter(e -> e.id().equals(id)).findFirst(); }

  public static String norm(String s) {
    if (s == null) return "";
    return s.toLowerCase().replace('’', '\'').replace('‘', '\'')
        .replaceAll("[^a-z0-9\\s'/\\-]", " ").replaceAll("\\s+", " ").trim();
  }

  public static List<String> tokens(String normalized) {
    return normalized.isEmpty() ? List.of() : Arrays.asList(normalized.split(" "));
  }

  public static boolean isHinglish(String normalized) {
    return tokens(normalized).stream().anyMatch(HINGLISH::contains);
  }

  /** All entries with a score above 0, best first. */
  public List<Match> rank(String userText) {
    String text = norm(userText);
    if (text.isEmpty()) return List.of();
    List<String> toks = tokens(text);
    Set<String> tokSet = new HashSet<>(toks);
    List<Match> out = new ArrayList<>();
    for (Entry e : entries) {
      int s = score(e, text, tokSet, toks);
      if (s > 0) out.add(new Match(e, s));
    }
    out.sort((x, y) -> Integer.compare(y.score(), x.score()));
    return out;
  }

  private static int score(Entry e, String text, Set<String> tokSet, List<String> toks) {
    int score = 0;
    for (String kw : e.k()) {
      if (kw.contains(" ")) {
        if (text.contains(kw)) score += 3 + kw.split(" ").length;
      } else if (tokSet.contains(kw)) {
        score += 2;
      } else if (kw.length() >= 4) {
        // light stemming: "purchases" ~ "purchase", "analyzing" ~ "analyze"
        for (String tk : toks) {
          if (tk.length() >= 4 && (tk.startsWith(kw) || kw.startsWith(tk)) && Math.abs(tk.length() - kw.length()) <= 3) { score += 1; break; }
        }
      }
    }
    return score;
  }
}