# Worth Wise 💸

**A personal purchase decision engine that answers one question: _"Should I buy this right now?"_**

🔗 **Live demo:** https://worthwise-topaz.vercel.app/

Worth Wise looks at your income, expenses, savings, emergency fund and goals, then tells you whether to **Buy Now**, **Wait**, **Consider an Alternative**, or **Don't Buy**, with clear reasons, a safe price range and a suggested wait time.

> **Design principle:** the financial decision is made by a **deterministic backend engine**, never by an LLM. The AI (OpenRouter) is only used to write a friendly explanation, and the app still returns a full decision if the AI is unavailable.

<!-- Add screenshots here, e.g.
![Dashboard](docs/dashboard.png)
![Decision result](docs/decision.png)
-->

## Features

**Decision engine**
- 🧮 Evaluates **one-time** and **EMI** purchases (true total cost = down payment + EMI × months)
- 📊 Score (0-100), reason codes, safe price range, recommended wait months and an action plan
- ⏳ Goal-delay estimation: how many months a purchase pushes back your savings goal
- 🎯 Matches the purchase to the most relevant goal by category

**Smart market research (after every prediction)**
- 🛒 Searches the internet (Google Shopping via SerpApi, India results) for the same or similar products
- 💰 Shows products **around your entered price** and **cheaper options within your safe price range**
- 🏷️ Each result shows product name, price, store, rating, review count, thumbnail and a direct buy link
- 🔁 For EMI purchases, highlights options that cost less than your total EMI outlay
- 🛡️ If the search fails or no key is set, your financial decision still works normally

**AI explanation**
- 🤖 Friendly, personalised explanation via OpenRouter using your real numbers, with automatic fallback text if AI is unavailable

**Accounts and data**
- 🔐 JWT authentication with BCrypt password hashing and per-user data isolation
- 👤 Financial profile: income, expense categories, savings, emergency fund target, existing EMI, preferences
- 🎯 Savings goals with target amount, date, priority and progress
- 🕘 Full purchase history with a detail view, **re-evaluate** a past decision with your updated finances, and delete decisions
- 🗑️ Delete account with password confirmation (removes all your data)

**Dashboard and UI**
- 📈 Dashboard with financial snapshot, financial health, goal progress, recent decisions and planned purchases
- 🧭 Guided step-by-step purchase evaluation flow with a loading state and result screen
- 🎛️ Interactive live simulator on the landing page that previews how price changes the verdict
- 🌗 Light and dark theme toggle
- 📱 Responsive layout with a mobile bottom navigation bar

## How the decision works

The engine (`DecisionEngine.java`) starts every purchase at a score of 100 and subtracts penalties:

| Rule | Penalty |
|---|---|
| Savings after purchase would be negative | -45 |
| Purchase pushes savings below the emergency fund target | -25 |
| No monthly surplus left after purchase (EMI) | -20 |
| Goal delayed by 2+ months | -5 per month (max -20) |
| Low affordability (price > 2.5× monthly surplus, or EMI > 50% of surplus) | -15 |

**Decision rules**

| Condition | Decision |
|---|---|
| Savings go negative, or score < 35 | `DONT_BUY` |
| Below emergency fund and score ≥ 60 | `WAIT` |
| Score < 60 | `CONSIDER_ALTERNATIVE` |
| Goal delayed 2+ months, or score < 75 | `WAIT` |
| Otherwise | `BUY_NOW` |

Purchases under 0.1% of monthly income are approved automatically.

For EMI purchases, the **down payment** leaves savings today and the **monthly EMI** reduces the monthly surplus. Each is counted exactly once.

## Smart market research

After the engine decides, Worth Wise doesn't just say "wait". It goes online and shows you what you could buy instead.

1. The engine calculates your **safe price range** (what you can spend without hurting your emergency fund or monthly surplus).
2. The backend makes one Google Shopping search (SerpApi) for the product, and scans up to 40 results.
3. Results are filtered to keep only useful options:
   - products priced **within ±25% of the price you entered**, and
   - **cheaper products** that are also within your safe price range.
   - For EMI purchases, any option below your total EMI outlay also counts as a real saving.
4. Up to 8 results are returned and shown with title, price, store, rating, reviews, image and link.

The call has a 10 second timeout and never blocks the decision. If the search is unavailable, the result page simply skips this section.

## Architecture

```
Frontend (HTML/CSS/JS, Vercel)
        │  REST + JWT
        ▼
Spring Boot API (Render, Docker)
        │
        ├── JWT filter → user context
        ├── Financial profile + goals  ──►  PostgreSQL
        ├── DecisionEngine (deterministic score + decision)
        ├── MarketResearchService  ──►  SerpApi (Google Shopping)
        └── AIExplanationService   ──►  OpenRouter (optional, with fallback)
```

The database is the source of truth. The LLM never acts as memory and only receives the minimum financial context needed to write the explanation.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript |
| Backend | Java 21, Spring Boot, Spring Web, Spring Security, Spring Data JPA |
| Auth | JWT (jjwt), BCrypt |
| Database | PostgreSQL (H2 available for quick local runs) |
| AI / Data | OpenRouter (explanations), SerpApi Google Shopping (price research) |
| Build / Deploy | Maven, Docker, Vercel (frontend), Render (backend) |
| Testing | JUnit 5, AssertJ |

## API

All endpoints except auth and health require `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Log in, receive JWT |
| GET | `/api/auth/me` | Current user |
| DELETE | `/api/auth/Delete` | Delete account and all its data |
| GET / PUT | `/api/profile` | Get or update financial profile |
| GET / POST | `/api/goals` | List or create goals |
| PUT / DELETE | `/api/goals/{id}` | Update or delete a goal |
| POST | `/api/purchases/evaluate` | Evaluate a purchase |
| GET | `/api/purchases/history` | Past decisions |
| GET | `/api/purchases/{id}` | One decision |
| GET | `/api/purchases/revaluate/{id}` | Re-run a past decision with current data |
| DELETE | `/api/purchases/{id}` | Delete a decision |
| GET | `/api/dashboard` | Profile, goals and recent decisions |
| GET | `/api/health` | Health check |

Swagger UI (local): `http://localhost:5000/swagger-ui/index.html`

**Example request** (`POST /api/purchases/evaluate`)

```json
{
  "productName": "Sony Headphones",
  "category": "Electronics",
  "price": 12000,
  "purchaseType": "ONE_TIME",
  "reason": "Need focus during study"
}
```

**EMI example**

```json
{
  "productName": "Laptop",
  "category": "Laptop",
  "price": 60000,
  "purchaseType": "EMI",
  "downPayment": 10000,
  "monthlyEmi": 5000,
  "durationMonths": 12
}
```

## Getting started

### Prerequisites

- Java 21
- Maven 3.9+
- PostgreSQL (or use H2, see below)

### 1. Create the database

```sql
CREATE DATABASE worth_wise;
```

### 2. Configure environment variables

Create a `.env` file in the project root (it is git-ignored) or set these in your shell:

| Variable | Description | Required |
|---|---|---|
| `SPRING_DATASOURCE_URL` | e.g. `jdbc:postgresql://localhost:5432/worth_wise` | Yes |
| `SPRING_DATASOURCE_USERNAME` | Database user | Yes |
| `SPRING_DATASOURCE_PASSWORD` | Database password | Yes |
| `APP_JWT_SECRET` | Random string, at least 32 characters | Yes |
| `APP_OPENROUTER_API_KEY` | OpenRouter key. Leave empty to use built-in fallback text | Set (can be empty) |
| `APP_OPENROUTER_MODEL` | Defaults to `minimax/minimax-m3:free` | No |
| `SERPAPI_API_KEY` | Enables live price research. Skipped if empty | No |
| `PORT` | Defaults to `5000` | No |

Example `.env`:

```
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/worth_wise
SPRING_DATASOURCE_USERNAME=postgres
SPRING_DATASOURCE_PASSWORD=your_password
APP_JWT_SECRET=replace-with-a-long-random-string-32-chars-min
APP_OPENROUTER_API_KEY=
SERPAPI_API_KEY=
```

> **Quick start without PostgreSQL:** set `SPRING_DATASOURCE_URL=jdbc:h2:mem:worthwise`, username `sa` and an empty password.

### 3. Run the backend

```bash
mvn spring-boot:run
```

The API starts on `http://localhost:5000`.

### 4. Run the frontend

In `frontend/app.js`, switch `API_BASE` to the local line:

```js
const API_BASE = 'http://localhost:5000/api';
```

Then open `frontend/index.html` in your browser (or serve the `frontend` folder with any static server).

Create an account, save your profile, add goals, then analyze a purchase.

## Tests

The decision engine is covered by **26 JUnit 5 unit tests** (`DecisionEngineTest` and `DecisionEngineEdgeCasesTest`), including:

- Buy / wait / don't-buy / consider-alternative outcomes
- Emergency fund thresholds and exact-boundary cases
- EMI cost math (down payment vs. monthly EMI)
- Goal matching and goal-delay calculation
- Zero and negative surplus, score clamping, and the 12-month wait cap

```bash
mvn test
```

## Deployment

- **Backend:** Docker image built with the included `Dockerfile` and deployed on Render. It reads `PORT` from the environment.
- **Frontend:** the `frontend` folder is deployed on Vercel (`vercel.json` included).

## Project structure

```
Worth_Wise/
├── frontend/                  # HTML, CSS, JS single-page UI
├── src/main/java/com/spendwise/
│   ├── controller/            # REST controllers
│   ├── service/               # Profile, goals, purchases, AI, market research
│   ├── engine/                # DecisionEngine (deterministic logic)
│   ├── security/              # JWT filter and security config
│   ├── entity/ repository/   # JPA entities and repositories
│   ├── dto/ exception/        # API models and error handling
│   └── model/                 # Enums
├── src/test/java/             # Unit tests
├── Dockerfile
└── pom.xml
```

## Database schema

```
                    users
            ┌──────────────────┐
            │ id, email        │
            │ password_hash    │
            │ name, gender ... │
            └────────┬─────────┘
                     │
        ┌────────────┼───────────────┐
        ▼            ▼               ▼
 financial_profile   goal      purchase_decision
 (income, expenses,  (name,    (product, price, decision,
  savings, risk...)   amount,   score, reason codes,
                      date...)  wait months, ...)
```

## Roadmap

- [ ] Restrict CORS to the production frontend domain
- [ ] Disable Swagger and H2 console in production
- [ ] Integration tests for services and controllers
- [ ] Replace the engine's fixed 70% "comparable lower-cost option" with a price based on real market results
- [ ] Charts for spending and goal progress

## Author

**Your Name** · [GitHub](https://github.com/your-username) · [LinkedIn](https://linkedin.com/in/your-profile)