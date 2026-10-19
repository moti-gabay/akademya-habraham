# Akademya Habraham

Recorded Torah lessons for people studying toward conversion. Hebrew first (RTL), with English, Russian and Spanish.

- Architecture and decisions: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Visual source of truth: [`design/final-sketch.pdf`](design/final-sketch.pdf) (page renders in `design/reference/`)

Current state: the UI from the sketch (language selection, home, lesson player), public holiday pages and the admin catalog screens run on mock data by default, or on Postgres with `DATA_SOURCE=db`. No keys are needed for mock mode. Video hosting, search and billing are later milestones.

## Run

```bash
pnpm install
pnpm dev              # http://localhost:3000
MOCK_ROLE=admin pnpm dev   # the same, with the sample visitor as an admin: open /he/admin
```

Optional: copy `.env.example` to `.env.local`. `NEXT_PUBLIC_HELP_PHONE` and `NEXT_PUBLIC_HELP_WHATSAPP` fill the "Need help?" card. Everything else is unused until its milestone.

```bash
pnpm lint             # ESLint + check that only logical Tailwind classes are used
pnpm typecheck
pnpm build            # before a pull request: STRICT_STATIC_PARAMS=1 DATA_SOURCE=mock pnpm build
pnpm test:e2e         # Playwright: 375px and 1280px, Hebrew and English, axe, screenshots (screenshots compare locally only, not in CI)
pnpm test:e2e --update-snapshots   # after an intended visual change
```

Database (optional; the app defaults to mock data):

```bash
pnpm db:generate      # after editing src/server/db/schema.ts: writes a migration into drizzle/
pnpm db:migrate       # applies migrations to DATABASE_URL_UNPOOLED (Neon; the driver does not reach a local Postgres)
pnpm db:seed          # upserts the fictional sample content into DATABASE_URL; refuses when NODE_ENV=production
pnpm test:unit        # migrations, seed, Drizzle repos, auth and the Clerk webhook on an in-process Postgres (PGlite)
DATA_SOURCE=db pnpm dev   # run the app on the database instead of mock data
```

The scripts read `.env.local` and `.env` themselves. Put `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` there and never commit them.

**The database is opt-in.** Only `DATA_SOURCE=db` selects it; a `DATABASE_URL` alone does not. Without Clerk keys every visitor is the sample user, so a database deployment needs sign-in configured first; on Vercel the app refuses to start with `DATA_SOURCE=db` and no Clerk keys. Vercel currently stays on mock (`DATA_SOURCE` unset).

`MOCK_ROLE=admin` works only on mock data: it is ignored with `DATA_SOURCE=db`, with Clerk, on Vercel and in production builds (`pnpm start` ignores it). Its changes live in server memory until restart; on a database the admin screens need a real admin signed in through Clerk. The e2e suite therefore starts two servers: a production build on port 3100, and a dev server with `MOCK_ROLE=admin` on port 3101 for the admin screens. Neither opens the database.

**Media is opt-in too.** Only `MEDIA_PROVIDER=bunny` and `FILE_STORAGE=r2` select Bunny Stream and Cloudflare R2. Otherwise in-memory fakes stand in: uploads go to the app itself, a video is "ready" a few seconds after upload (`FAKE_MEDIA_PROCESSING_MS`), files are lost on restart, and the admin media section says so in a banner. The fake routes (`/api/dev/media/*`) are switched off on Vercel.

The e2e servers never use a real media account or database, even when `.env` selects one: Playwright sets `DATA_SOURCE=mock` and blanks `DATABASE_URL`, `MEDIA_PROVIDER` and `FILE_STORAGE` for them. The admin dev server writes to its own output directory, `.next-e2e-dev` (via `NEXT_DIST_DIR` in `next.config.ts`), which is emptied on every start: sharing `.next` with the production build, or a cache left by an interrupted run, made its pages reload in a loop.

A build never fails because the catalog cannot be read: the holiday pages are then rendered on first request, with a `[build]` warning. `STRICT_STATIC_PARAMS=1` turns that into an error.

First e2e run on a machine: `pnpm exec playwright install chromium`. The player test streams a public HLS sample, so it needs network.

## Sign-in (Clerk)

Sign-in is active only when **both** Clerk keys are set **and** `DATA_SOURCE=db`. In every other case, including mock mode and CI, each visitor is the sample user and no keys are needed. `/api/healthz` shows the current mode (`auth: "clerk" | "stub"`).

Keys go in `.env` and are never committed: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CLERK_WEBHOOK_SIGNING_SECRET` once a webhook endpoint exists.

The publishable key is baked in at build time. After changing Clerk keys, rebuild (`pnpm build`) or redeploy; a server started from an older build fails sign-in with a handshake error.

Clerk dashboard checklist:

1. **API keys:** copy the two keys of the development instance into `.env`.
2. **Sign-in methods** (User & authentication): email address with a verification code. For this audience, consider leaving passwords off.
3. **Name:** turn on first and last name, first name required (it is used in the greeting).
4. **Multi-factor:** enable authenticator app (TOTP) and backup codes. The admin area requires a second factor. MFA works on development instances; whether the free plan covers it in production is not verified (see open risks in ARCHITECTURE.md).
5. **Webhook** (Webhooks → Add endpoint): `https://<your-domain>/api/webhooks/clerk`, events `user.created`, `user.updated`, `user.deleted`. Copy the signing secret into `CLERK_WEBHOOK_SIGNING_SECRET`. Clerk cannot reach localhost; local sign-in works without the webhook because a missing user row is created on first request.
6. **First admin:** Users → your user → Metadata → Public → `{"role": "admin"}`. Roles are `user`, `editor`, `admin`.
7. **Languages:** the sign-in screens are translated in code (he, en, ru, es). Verification emails come from Clerk's own templates (Customization → Emails) and stay in English unless you edit them there.

Session token customization and dashboard path settings are not needed.

## Media (Bunny Stream and R2)

Variables, in `.env` and never committed (names are in `.env.example`):
- `MEDIA_PROVIDER=bunny` with `BUNNY_LIBRARY_ID`, `BUNNY_API_KEY`, `BUNNY_PULL_ZONE_HOST` and `BUNNY_WEBHOOK_SECRET`. `BUNNY_TOKEN_SECURITY_KEY` is for signed playback in Milestone 4.
- `FILE_STORAGE=r2` with `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET`.

Bunny Stream checklist:
1. Create a video library; copy its library id and API key, and the pull zone host name.
2. **Webhook:** set the library's webhook URL to `https://<your-domain>/api/webhooks/bunny/<secret>`, where `<secret>` is a long random string you also put in `BUNNY_WEBHOOK_SECRET`. Bunny cannot reach localhost; locally the admin screen's polling picks up the status instead.
3. Token authentication, allowed referrers and blocking direct file access are Milestone 4 (§1.4 in ARCHITECTURE.md); leave them off until signed playback exists.

Cloudflare R2 checklist:
1. Create a bucket and an API token with object read and write on that bucket only; copy the account id, access key id and secret.
2. Keep the bucket private (no custom domain, r2.dev off). The app serves thumbnails (`/api/thumbnails/...`, cached as immutable) and captions (`/api/captions/...`) itself.
3. **CORS** on the bucket: allow `PUT` from the app's origins (production, preview and `http://localhost:3000`) with the `Content-Type` header, so the browser can upload thumbnails with the presigned URL.

**After this branch is merged:** migration `0004` (video and caption tables) must be applied (`pnpm db:migrate`) and the seed re-run (`pnpm db:seed`) on any database used with `DATA_SOURCE=db`; it gives the sample lessons a ready video so they stay publishable. That is the owner's step; nothing here applies it.

## Folder structure

```
src/app/[locale]/            layout sets <html lang dir data-text-size>
  welcome/                   first visit: language + text size
  (app)/                     header + bottom navigation: home, path, search, glossary, help
    admin/                   admin catalog: lists, and one form per entity with a tab per language
  (public)/holidays/         holiday catalog and lesson previews: static, open to signed-out visitors
  blocked/, sign-in/, sign-up/
  (lesson)/lessons/[id]/     lesson player (no header or bottom navigation on mobile)
src/app/api/                 thin route handlers (healthz, telemetry/heartbeat, admin/users, admin/catalog, admin/media, captions, webhooks/clerk, webhooks/bunny, dev/media for the fakes)
src/components/              UI; home/ holds the home page cards, admin/ the admin forms, catalog/ the lesson preview
src/i18n/                    next-intl routing, navigation, messages/{he,en,ru,es}.json
src/lib/                     auth mode and getActor (the only Clerk session code), text size preference, catalog cache, helpers
src/server/                  domain layer, no imports from next/*
  repos/types.ts             repo interfaces + view models
  repos/index.ts             the one place that chooses mock or database repos (DATA_SOURCE)
  mock/                      sample content (also the seed's source), the in-memory store and mock repos
  catalog/                   catalog rules: admin service, input schemas, who can watch, public reads
  media/                     media interfaces, Bunny and R2 adapters, fakes, the one switch, media service
  db/                        Drizzle client, schema, repos, seed and their tests; migrations are generated into drizzle/
  auth/                      Clerk user sync, actor and role checks, audit log, admin user changes
src/proxy.ts                 locale routing, first-visit redirect, sign-in redirect, same-origin check for API writes
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

## Add a sample lesson

Edit `src/server/mock/data.ts` (the mock repos and `pnpm db:seed` both read it):

1. Add an entry to `lessons` with a new id: title and teacher per locale (`he` is required), `durationSec`, `stepId`, `lessonNumber`, `videoUrl` (HLS) and `subtitles` (VTT files in `public/samples/`).
2. List glossary term ids in `termIds`. They appear under "Words from the lesson", and a term is underlined in the title when its name appears there literally. New terms go in `glossary` in the same file.
3. Open `/he/lessons/<id>` in mock mode. On the database, run `pnpm db:seed` again; lesson ids there are UUIDs, so follow the link from the home page.

Real lessons are added in the admin screens (`/admin/lessons`): Hebrew first, other languages in their tabs, then Publish. A lesson in a holiday category appears under `/holidays` once published.

## Known limits

- The sample video is a public test stream (10:34 long), while the sample lesson says 42:15 with a stop point at 12:40. The player shows the real stream length and starts from the beginning when the stop point is past the end.
- Subtitles are loaded with `<track>`. On iOS they must come from the HLS manifest, which arrives with Bunny Stream in Milestone 4.
- In mock mode progress is kept in server memory: it resets on restart and is not reliable on serverless hosting.
- On the database every lesson still plays the same sample stream, a user has one name for all languages, and most seeded lessons are placeholders ("שבת · שיעור 3").
- Without Clerk (mock mode) the user is always the sample user "Moshe".
- The admin area manages the catalog only; users, payments and statistics come in Milestone 6. Rate limiting is not in place yet.
- A lesson can be published only once its uploaded video is ready, but the player still streams the sample video until signed playback arrives (Milestone 4). Uploaded captions and the lesson image are used.
- Not verified without keys: every Bunny call (create, tus upload from a browser, status, captions, delete, thumbnail URL), the Bunny webhook's real payload, and R2 from a browser (presigned PUT, which needs bucket CORS) and from the server. Only the R2 signing is checked, against AWS's published example. Migration `0004` is not applied anywhere yet.
- Who can watch is decided in the page only (`canWatch`). Until `/api/play` exists (Milestone 4) nothing protects the stream itself, and until billing exists members-only lessons are open to every signed-in user.
- Migration `0003` (lesson access `members`, key points) is applied to the Neon dev database. Any other database needs it before the app can read lessons with `DATA_SOURCE=db`.
- Not verified without keys: the preview button's signed-in and signed-out states under Clerk, static rendering with `ClerkProvider`, the batch write path against Neon, and tag revalidation on a production build (the admin e2e runs in dev mode).
- Not verified yet: an admin with an authenticator app actually entering `/admin` (the refusal without a second factor is verified), and real webhook delivery from Clerk.
