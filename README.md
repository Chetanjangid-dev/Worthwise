# Worth Wise / SpendWise

Personal Purchase Decision Engine: a full-stack app that answers, "Should this user buy this product right now?"

The financial decision is primarily determined by deterministic backend calculations. OpenRouter is used only for contextual explanation text, and the backend returns a decision even when AI is unavailable.

## Stack

- Frontend: existing HTML, CSS, JavaScript single-page app
- Backend: Java 21, Spring Boot, Maven, Spring Web, Spring Security, JWT, Spring Data JPA
- Database: PostgreSQL in production, H2 fallback for local quick start
- AI: OpenRouter via `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`

## Architecture

Frontend -> Spring Boot REST API -> JWT user context -> financial profile -> goals -> deterministic decision engine -> purchase history -> optional OpenRouter explanation.

The database is the source of truth for profile, goals, and purchase decision history. The LLM never acts as memory and receives only minimized financial context.

## API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/profile`
- `PUT /api/profile`
- `GET /api/goals`
- `POST /api/goals`
- `PUT /api/goals/{id}`
- `DELETE /api/goals/{id}`
- `POST /api/purchases/evaluate`
- `GET /api/purchases/history`
- `GET /api/purchases/{id}`
- `GET /api/dashboard`

Swagger is available at `http://localhost:5000/swagger-ui/index.html`.

## Environment

```powershell
$env:DB_USER="postgres"
$env:DB_HOST="localhost"
$env:DB_PORT="5433"
$env:DB_NAME="worth_wise"
$env:DB_PASSWORD="admin123"
$env:PORT="5000"
$env:JWT_SECRET="replace-with-at-least-32-characters"
$env:OPENROUTER_API_KEY=""
$env:OPENROUTER_MODEL="openai/gpt-4o-mini"
```

Create the PostgreSQL database first:

```sql
CREATE DATABASE worth_wise;
```

## Run

```powershell
cd C:\Users\Lenovo\Desktop\Worth_Wise
Copy-Item .env.example .env
.\run-local.ps1
```

Then open `http://localhost:5000/` in the browser. Create a user account, save the profile, add goals, and analyze purchases from that same backend-served UI.

There is no seeded account and no mock fallback for signed-in screens. PostgreSQL is the source of truth.

## Example Purchase Request

```json
{
  "productName": "Sony Headphones",
  "category": "Electronics",
  "price": 12000,
  "purchaseType": "ONE_TIME",
  "reason": "Need focus during study"
}
```

## Database Schema

- `users`: UUID user id, email, password hash, timestamps
- `financial_profile`: user-owned financial state, income, expense categories, savings, emergency target, preferences
- `goal`: user-owned goals with target amount, current amount, target date, priority, status
- `purchase_decision`: user-owned purchase request, deterministic result, score, reason codes, wait months, safe price range, explanation

## Frontend Integration

The existing UI is served from `src/main/resources/static`, so starting Spring Boot is enough to run the API and frontend together.
