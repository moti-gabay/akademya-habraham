# Akademya Habraham

Recorded Torah lessons for people studying toward conversion. Hebrew first (RTL), with English, Russian and Spanish.

- Architecture and decisions: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Visual source of truth: [`design/final-sketch.pdf`](design/final-sketch.pdf) (page renders in `design/reference/`)

Current state: the UI from the sketch (language selection, home, lesson player) runs on mock data. No keys are needed. Database, auth, video hosting and billing are later milestones.

## Run

```bash
pnpm install
pnpm dev              # http://localhost:3000
```

Optional: copy `.env.example` to `.env.local`. `NEXT_PUBLIC_HELP_PHONE` and `NEXT_PUBLIC_HELP_WHATSAPP` fill the "Need help?" card. Everything else is unused until its milestone.

```bash
pnpm lint             # ESLint + check that only logical Tailwind classes are used
pnpm typecheck
pnpm build
pnpm test:e2e         # Playwright: 375px and 1280px, Hebrew and English, axe, screenshots (screenshots compare locally only, not in CI)
pnpm test:e2e --update-snapshots   # after an intended visual change
```

Database (not needed for the mock stage):

```bash
pnpm db:generate      # after editing src/server/db/schema.ts: writes a migration into drizzle/
pnpm db:migrate       # applies migrations to DATABASE_URL_UNPOOLED (Neon; the driver does not reach a local Postgres)
```

First e2e run on a machine: `pnpm exec playwright install chromium`. The player test streams a public HLS sample, so it needs network.

## Folder structure

```
src/app/[locale]/            layout sets <html lang dir data-text-size>
  welcome/                   first visit: language + text size
  (app)/                     header + bottom navigation: home, path, search, holidays, glossary, help
  (lesson)/lessons/[id]/     lesson player (no header or bottom navigation on mobile)
src/app/api/                 thin route handlers (healthz, telemetry/heartbeat)
src/components/              UI; home/ holds the home page cards
src/i18n/                    next-intl routing, navigation, messages/{he,en,ru,es}.json
src/lib/                     text size preference, time formatting, help contacts
src/server/                  domain layer, no imports from next/*
  repos/types.ts             repo interfaces + view models
  repos/index.ts             the one place that chooses mock or real repos
  mock/                      sample content and in-memory mock repos
  db/                        Drizzle client and schema; migrations are generated into drizzle/
src/proxy.ts                 locale routing, first-visit redirect, Clerk when keys exist
tests/                       Playwright specs and screenshot baselines
design/                      sketch, reference renders, earlier concepts
```

## Rules that keep RTL and accessibility working

- Logical Tailwind classes only (`ms-`, `pe-`, `start-`, `text-start`). `pnpm lint` fails on `ml-`, `pr-`, `left-` and similar.
- Sizes in rem. The text size preference changes the root font size, so the whole UI scales. Interactive elements use the `tap` utility (48px minimum).
- Timecodes go through `<Timecode>` so they stay left to right inside Hebrew.
- No text in components: every string comes from the message files or from a repo.

## Add a language

1. Add the code to `LOCALES` in `src/server/i18n/locales.ts`.
2. Add its name to `localeNames` in `src/i18n/routing.ts`. If it is right-to-left, extend `dirOf` there.
3. Copy `src/i18n/messages/en.json` to `<code>.json` and translate it.
4. Add the font subset in `src/app/[locale]/layout.tsx` if Rubik's current subsets do not cover the script.
5. Content (lessons, steps, glossary) falls back to Hebrew until it is translated.

`ru.json` and `es.json`, and the ru/es sample content in `src/server/mock/data.ts`, are machine drafts and need review by native speakers.

## Add a lesson (mock stage)

Edit `src/server/mock/data.ts`:

1. Add an entry to `lessons` with a new id: title and teacher per locale (`he` is required), `durationSec`, `stepId`, `lessonNumber`, `videoUrl` (HLS) and `subtitles` (VTT files in `public/samples/`).
2. List glossary term ids in `termIds`. They appear under "Words from the lesson", and a term is underlined in the title when its name appears there literally. New terms go in `glossary` in the same file.
3. Open `/he/lessons/<id>`.

When the catalog moves to the database (Milestone 3), lessons are added in the admin screens and `src/server/repos/index.ts` switches to the Drizzle repos.

## Known limits of the mock stage

- The sample video is a public test stream (10:34 long), while the sample lesson says 42:15 with a stop point at 12:40. The player shows the real stream length and starts from the beginning when the stop point is past the end.
- Subtitles are loaded with `<track>`. On iOS they must come from the HLS manifest, which arrives with Bunny Stream in Milestone 4.
- Progress is kept in server memory: it resets on restart and is not reliable on serverless hosting.
- The signed-in user is always the sample user "Moshe".
