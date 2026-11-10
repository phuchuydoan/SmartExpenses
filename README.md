# SmartSpend AI

**Track smarter. Spend better. Save more.**

A smart personal finance and AI budget planner. It does more than record expenses: it plans a monthly budget, tells you how much you can spend *today*, warns you before you overspend, and uses Google Gemini to explain your habits and suggest what to do next.

| | |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4, Recharts, React Router |
| Backend | Node.js, Express, Zod, JWT + bcrypt |
| Database | MySQL (Prisma ORM) |
| AI | Gemini API (called from the backend only) |
| Artwork | Generated with Higgsfield AI (`client/public/images`) |

## Features

1. **Budget Planning** - monthly income, savings goal and a limit per category. *AI Auto Budget* proposes a split from your income, fixed costs and spending history; you review and edit before saving.
2. **Expense Tracking** - add, edit, delete, search and filter income and expenses; recurring transactions that post automatically or remind you.
3. **Daily Spending Planner** - a daily limit computed from what is really left, the days remaining and the bills still due. Unspent allowance can be moved to a savings goal or rolls over to the following days.
4. **AI Financial Advisor** - spending analysis with observations and recommendations, and a "chat with your money" assistant.
5. **Smart Alerts** - budget thresholds you choose (50/70/80/90/100%), over-budget alerts, bill reminders, unusual-spending detection and a weekly report.
6. **Analytics** - daily, weekly and monthly spending, category breakdown, income vs expenses, month-over-month comparison.
7. **Financial Goals** - multiple goals with the amount to save per day and per week to reach each one on time.

## Getting started

Requirements: Node.js 20+ and a MySQL 8 (or MariaDB 10.6+) database.

```bash
# 1. Database (or point DATABASE_URL at any MySQL server)
docker compose up -d

# 2. Backend
cd server
cp .env.example .env        # then fill in JWT_SECRET and GEMINI_API_KEY
npm install
npm run db:push             # create the tables
npm run db:seed             # optional demo data: demo@smartspend.app / demo12345
npm run dev                 # http://localhost:4000

# 3. Frontend (second terminal)
cd client
npm install
npm run dev                 # http://localhost:5173
```

Get a Gemini API key at <https://aistudio.google.com/apikey>. Without a key the app still works: analysis and Auto Budget fall back to built-in rules and the chat is disabled.

Run the backend unit tests with `npm test` inside `server/`.

## How the AI is kept honest

Gemini never does the accounting.

1. Express loads the user's transactions, budget, bills and goals from MySQL.
2. Node.js computes every figure in integer cents (`server/src/services/finance.js`, `planner.js`) and builds a summarised, de-identified snapshot (`ai.js` -> `buildSnapshot`).
3. Only that snapshot is sent to Gemini, with a JSON response schema.
4. The answer is validated with Zod and sanitised - for example a suggested saving can never be larger than what was actually spent, and Auto Budget amounts are re-split in cents so they always add up to the income.

Alerts are triggered by real totals from the database (`alerts.js`), never by an AI estimate.

## Security notes

- The Gemini API key lives only in `server/.env`. The React app talks to `/api` and never sees it.
- Passwords are hashed with bcrypt; sessions are JWTs sent as a Bearer token.
- Every query is scoped to the signed-in user, and referenced accounts, categories and goals are ownership-checked.
- All input is validated with Zod; login and AI routes are rate limited.
- No names, emails or credentials are sent to the AI.

## Data model

`users`, `accounts`, `categories`, `transactions`, `budgets`, `budget_categories`, `savings_goals`, `recurring_transactions`, `notifications`, `ai_insights` - see `server/prisma/schema.prisma`.

- Money is `DECIMAL(12,2)`, never `FLOAT`.
- Transaction and due dates are `DATE` columns holding the user's local calendar day; "today" is resolved in the user's timezone.
- A transaction's `type` is `income`, `expense` or `savings` (money moved into a goal).

## Project structure

```
server/
  prisma/schema.prisma   database schema
  prisma/seed.js         demo data
  src/routes/            REST endpoints
  src/services/          budget engine, daily planner, alerts, analytics, Gemini
  src/lib/               money (cents), dates, validation helpers
  test/                  unit tests for the money, date and planner logic
client/
  src/pages/             Dashboard, Transactions, Budget, Planner, Analytics, Goals, Advisor, Settings
  src/components/        layout, forms, notifications, UI kit
```

## Deployment

- **Frontend**: Vercel (or any static host). Set `VITE_API_URL` to the backend URL, e.g. `https://your-api.example.com/api`.
- **Backend**: Render or Railway. Set `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY` and `CLIENT_ORIGIN` (the frontend URL). Run `npx prisma db push` once.
- **Database**: any hosted MySQL.

## Not built yet

- Browser push notifications (alerts are in-app, in the bell menu).
- Receipt upload with AI extraction.
