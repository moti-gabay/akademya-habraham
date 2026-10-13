# Working rules for this repository

Read `ARCHITECTURE.md` before changing anything; its decisions are binding. `README.md` covers running, structure and the Clerk checklist. `design/final-sketch.pdf` is the visual source of truth.

## Process
- Enter plan mode before any non-trivial work and wait for approval.
- One commit per stage, with a clear message.
- Start every piece of work on a new branch from an up-to-date `main`. Never push to `main`; changes reach it through a pull request.
- Before opening a PR, run and pass: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test:unit`, `pnpm test:e2e`.
- Do not call or change any external service (Neon, Clerk, Vercel, Bunny, Upstash, GitHub beyond the agreed push/PR) without the owner's explicit confirmation for that step.

## Secrets (this repository is public)
- Never read, print or commit `.env`, `.env.local` or any secret. Scripts load env files themselves (`scripts/load-env.ts`).
- Redact connection strings, keys, tokens and service hostnames from any output that is shown or pasted into commits and PRs.
- Seed and sample data must be fictional (for example `moshe@example.com`). The seed refuses to run when `NODE_ENV=production`.

## Data and deployment
- The database is opt-in: only `DATA_SOURCE=db` selects it. With anything else the app runs on mock data.
- Vercel stays on mock (`DATA_SOURCE` unset, no Clerk keys) until the owner says otherwise.
- Sign-in is active only with both Clerk keys and `DATA_SOURCE=db`. The app, CI and the e2e suite must keep working with no keys.
- `MOCK_ROLE=admin` is a local stand-in for an admin. It is honoured only with stub sign-in, off Vercel and outside production builds; never widen that.
- A build must not fail because the database is unreachable or behind on migrations: catalog `generateStaticParams` goes through `safeStaticParams`. Run `STRICT_STATIC_PARAMS=1 DATA_SOURCE=mock pnpm build` before a PR.
- Schema changes go through `pnpm db:generate`; migrations are applied to a real database only on request.

## Code
- `src/server/` has no imports from `next/*` or Clerk. Route handlers stay thin.
- Tailwind logical properties only (`ms-`, `pe-`, `start-`, `text-start`); `pnpm lint` enforces it.
- No user-facing text in components: all four message files in `src/i18n/messages/` get every new string (ru/es are drafts awaiting review).
- Audience is older adults: tap targets at least 48px, WCAG AA contrast, every icon labelled, sizes in rem.
- Do not add features that are not in the sketch; unsketched pages get a placeholder.
