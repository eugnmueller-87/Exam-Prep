# AB-100 Exam Practice Tool

A full-stack practice app for the **Microsoft AB-100 — Agentic AI Business Solutions Architect** certification exam.

## Features

- **Quiz Mode** — Timed practice sessions with configurable domain, difficulty, and question count. Answer selection, instant feedback, and detailed explanations.
- **Study Mode** — Browse all questions grouped by topic. Expand any question and reveal the correct answer with explanation at your own pace.
- **Dashboard** — Track overall accuracy, session scores, per-domain performance, and your weakest topics.

## Exam Coverage

All three domains from the [official AB-100 study guide](https://learn.microsoft.com/en-gb/credentials/certifications/resources/study-guides/ab-100):

| Domain | Weight | Questions |
|---|---|---|
| Plan AI-powered business solutions | 25–30% | 10 |
| Design AI-powered business solutions | 25–30% | 14 |
| Deploy AI-powered business solutions | 40–45% | 11 |

Topics covered include: multi-agent architecture, Copilot Studio, Microsoft Foundry, A2A & MCP protocols, ALM for agents, Responsible AI, data residency, prompt injection, ROI analysis, model routing, and more.

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + SQLite (via Drizzle ORM + better-sqlite3)
- **State**: TanStack Query

## Local Development

```bash
npm install
npm run dev
```

The app runs on [http://localhost:5000](http://localhost:5000).

## Production Build

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

The question bank is seeded automatically on first run (35 questions). Progress and session history persist in `data.db`.

## Project Structure

```
client/          # React frontend
  src/
    pages/       # Dashboard, Quiz, Study, Results
    components/  # Layout, shared UI
    lib/         # API client, query setup
server/          # Express backend
  routes.ts      # API endpoints
  storage.ts     # Drizzle ORM data layer
  questions-seed.ts  # 35 exam questions with explanations
shared/
  schema.ts      # Drizzle table definitions + Zod schemas
```
