# J2W Timeguard

In-house HR / attendance web app for J2W Business Solutions — geofenced punch
in/out, device binding, schedule enforcement, and leave management.

## Architecture

A monorepo with a clean frontend / backend split:

```
┌─────────────┐      REST + JWT      ┌──────────────┐     ┌──────────┐
│  frontend   │ ───────────────────▶ │   backend    │ ──▶ │ MongoDB  │
│ React SPA   │   /api/* (nginx      │ Express + TS │     │          │
│ (nginx)     │    proxy in prod)    │   REST API   │     │          │
└─────────────┘                      └──────────────┘     └──────────┘
```

- **`frontend/`** — Vite + React 19 + TanStack Router SPA, Tailwind v4, shadcn/ui.
  Talks to the backend over REST; JWT stored in `localStorage`.
- **`backend/`** — Express + TypeScript REST API, MongoDB via Mongoose, custom
  email/password auth (bcrypt + JWT). Role checks replace Postgres RLS.
- **`docker-compose.yml`** — MongoDB + backend + frontend in one command.

> Previously this was a TanStack Start + Supabase monolith. Supabase has been
> fully removed in favour of a self-hosted MongoDB + Express backend.

## Quick start (Docker)

```bash
export JWT_SECRET="$(openssl rand -base64 48)"
docker compose up -d --build
docker compose run --rm backend npm run seed   # demo data (optional)
# → http://localhost:3000
```

## Quick start (local dev)

```bash
cd backend  && cp .env.example .env && npm install && npm run seed && npm run dev
cd frontend && cp .env.example .env && npm install && npm run dev
# → http://localhost:3000  (API on :4000)
```

Demo login: `admin@j2w.in` / `demo@123` (see other accounts in DEPLOYMENT.md).

## Full setup & deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)** — MongoDB setup (Docker / Atlas / native),
where env vars go, building Docker images, and deploying on an Ubuntu VM.
