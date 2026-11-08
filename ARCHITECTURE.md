# Akademya Habraham — Architecture

Community VOD and subscription platform for recorded Torah lessons (Holidays, Weekly Parsha, Halacha).
Launch target: < 1k users, < 200 h of video, near-zero running cost, four languages (he RTL, en/ru/es LTR).
Design constraint: stateless and horizontally scalable from day one.

Decided 2026-10-07. Update this file when a decision changes.

Decision 2026-10-11: Milestone 0 is closed. The UI follows `design/final-sketch.pdf`, which replaces the five concepts and is the visual source of truth. The audience is older adults, so tap targets are ≥ 48 px, contrast is WCAG AA or better, and every icon has a text label.

Decision 2026-11-05: search is not in the first version. The `/search` placeholder and its strings are removed; on phones the bottom navigation shows Holidays in its place (home, path, holidays, help), so the holiday catalog has a way in on every screen size. Search (3c) comes back as a feature when the owner decides.

## Decisions

| Area | Choice | Why |
|---|---|---|
| Frontend + API | Next.js (App Router) on Vercel; backend in Route Handlers | One deployable, serverless = stateless + horizontal by default; domain layer kept Next-agnostic for a later lift-out |
| Database | Neon PostgreSQL (free tier, pooled connection string) | Pure Postgres with built-in PgBouncer, scale-to-zero; Supabase is the alternative |
| Cache / rate limit | Upstash Redis (free tier, REST) | Serverless-safe; used only for rate limits, entitlement cache, live counters |
| Auth | Clerk (free ≤ 10k MAU) | Next.js SDK, MFA (plan coverage unverified, see open risks), bot protection, localizations for he/en/ru/es |
| Video | Bunny Stream: token auth (signed HLS), allowed referrers, tus direct upload, in-manifest WebVTT | Lowest cost; signed HLS + origin lock accepted as the protection level (no DRM) |
| Assets | Cloudflare R2 (free tier) via S3 presigned PUT | Zero egress, direct browser uploads bypass Vercel body limits |
| Email | Resend (free tier) | Localized transactional email |
| Payments | Undecided; `BillingProvider` interface | PayPlus for an Israeli entity, Stripe Billing otherwise |
| Background work | None long-running; inline idempotent webhooks + 2 daily Vercel Cron jobs | Inngest is the escape hatch when queues are needed |
| i18n | `next-intl`, locales he (default) / en / ru / es, translation tables in DB | RTL-first with logical CSS properties |

Open risks:
- **Vercel Hobby** is licensed for non-commercial use. Use Hobby for staging and move to Pro before the first paid subscriber.
- **Clerk MFA may need a paid plan in production** (recorded 2026-10-13). The admin area requires a verified second factor, and development instances allow MFA for testing, but we could not verify that the free tier covers MFA on a production instance. Check Clerk's current pricing before launch. Options if it is not covered: (a) pay for the plan or add-on that includes MFA when going to production; (b) make the admin second-factor requirement configurable so launch is possible without it, which weakens admin security and should be a deliberate, temporary choice. Nothing is implemented for (b); today the requirement is unconditional.

## 1. System overview

```
  Browser (he/en/ru/es) ──► Vercel: Next.js app + Route Handlers (/api/*)  ── Vercel Cron (daily: billing, rollups)
                               │ Clerk session cookie (same-origin, SameSite=Lax + Origin check)
                               ├──► Neon Postgres (pooled connection string, Drizzle)
                               ├──► Upstash Redis (rate limits, entitlement cache, live counters)
                               ├──► Bunny Stream API (create video, tus signature, captions)      ──webhook──┐
                               ├──► R2 (presigned PUT for thumbnails/PDFs/VTT masters)                       │
                               ├──► Resend (email)                                                           │
                               ◄──── Clerk webhooks (Svix) / PSP webhooks (HMAC) / Bunny encoding webhook ◄──┘
  Player ──signed HLS──► Bunny Stream CDN (token + expiry, allowed referrers, subtitle tracks in manifest)
```

### 1.1 Frontend
- `app/[locale]/...` routing with `next-intl`. `<html dir>` per locale. Tailwind logical properties only (`ms-`, `pe-`, `text-start`) so one stylesheet serves RTL and LTR. Font: Rubik (Hebrew, Cyrillic, Latin) via `next/font`.
- Locale resolution: URL prefix → `NEXT_LOCALE` cookie → `Accept-Language` → `he`, among the site languages only (next-intl's middleware ignores any other value). `users.locale` is recorded when the user row is created and is not used to choose the interface language. Hebrew calendar dates shown alongside Gregorian.
- Site languages (decided 2026-11-05, C4): the site is served in **he and en** only (`SITE_LOCALES` in `src/server/i18n/locales.ts`, used by the routing and by `listPublicParams`). `LOCALES` keeps all four as the **content** languages: the database `locale` enum, translations, admin tabs, and captions, which viewers can still choose in the player. `/ru` and `/es` addresses are 404 (no redirect). `ru.json` and `es.json` are frozen: new strings go into `he.json` and `en.json` only, and `src/i18n/messages.test.ts` checks that every site language has exactly the Hebrew keys. Enabling ru or es later: add it to `SITE_LOCALES`, translate the keys missing from its message file (the parity test covers every site language, so it lists them), review the file and the language's content with a native speaker, update the welcome screenshots. A language that is not in `LOCALES` at all also needs a migration for the database enum.
- Text size (added 2026-10-11): three levels (`s|m|l`) stored in the `ah_text_size` cookie. The root layout reads it and sets `data-text-size` on `<html>`, which changes the root font-size (100% / 112.5% / 125%), so SSR renders the right size with no flash. All sizes are in rem. A missing cookie means a first visit and redirects to `/[locale]/welcome`. Since 2026-10-13 (Milestone 3a) no layout reads the cookie: the server always renders the default size and an inline script in `<head>` (`TEXT_SIZE_SCRIPT` in `src/lib/prefs.ts`) sets the attribute before the first paint, so pages can be static. The script is a constant; when CSP arrives (Milestone 7) allow it by hash, not by nonce, since a nonce would make every page dynamic again.
- Clerk `clerkMiddleware()` guards `/[locale]/app/*` and `/[locale]/admin/*`; `<ClerkProvider localization>` per locale.
- Public catalog pages: ISR per locale, tag-revalidated on publish. Authenticated pages: TanStack Query → same-origin `/api/*`.
  - Built in Milestone 3a (2026-10-13), holidays only: `/[locale]/holidays` (holiday categories with at least one published lesson), `/holidays/[slug]` (its published lessons) and `/holidays/[slug]/[lessonSlug]` (a preview: title, short description, key points and a button; never the player). They live in the `(public)` route group, whose layout and header read nothing from the request. Signed-out visitors can open them, and they skip the first-visit redirect to `/welcome`. Parsha and halacha pages are not built.
  - Data is read through `unstable_cache` wrappers in `src/lib/catalogCache.ts`, tagged `catalog`, with `revalidate = 3600` as a backstop. Every successful admin catalog write calls `revalidateTag("catalog", "max")`: the next visit is served the old page while a fresh one is built.
  - `generateStaticParams` goes through `safeStaticParams` (`src/lib/staticParams.ts`). If the catalog cannot be read at build time (database unreachable, or a migration not applied yet, as on a preview deployment) it logs a warning and returns nothing, and the pages render on first request (`dynamicParams = true`). `STRICT_STATIC_PARAMS=1` makes that a build failure; use it for the checks before a pull request.
  - Slugs are per locale with the Hebrew slug as fallback. An address written with another language's slug resolves and redirects to the right one, so the language switch works on these pages.
  - Watching: `canWatch(actor, lesson)` in `src/server/catalog/access.ts`. Signed-out: no. `free`: any signed-in user. `members`: any signed-in user until billing exists (Milestone 5). Enforced on the server in `/api/play` since Milestone 4 (403 `members_only`); the lesson page uses the same function to show the preview card instead of the player, and `/api/captions` to refuse captions.
- Player: hls.js (Android/desktop), native HLS (iOS). Subtitles come from the HLS manifest so they work natively on iOS; default track = UI locale. Server-side resume, ABR, speed, PiP, Media Session API, session watermark overlay.
- Admin dashboard: `/[locale]/admin`; role-gated in middleware and in every handler. Freshness ≤ 30 s via polling; live viewers from Upstash. Content forms have a tab per language; `he` required, others optional.

### 1.2 Backend
```
src/server/            # NO imports from next/* — portable to a standalone service
  db/        drizzle schema, migrations, repos
  auth/      verifyRequest(): Clerk claims → {userId, role, locale}; requireRole()
  catalog/   lessons, categories, translations, search
  playback/  startPlayback(): who gets a signed video address (entitlement in M5, sessions in M6)
  telemetry/ heartbeat upsert, progress, rollups
  billing/   BillingProvider interface, state machine, adapters/{stripe,payplus}
  media/     bunny api client, r2 presign, captions sync
  i18n/      locale fallback helpers for DB content
app/api/...            # thin handlers: parse (zod) → call service → respond
```
- Statelessness: no module-level mutable state, no filesystem, config from env only.
- Data source (added 2026-10-12): `src/server/repos/index.ts` is the single switch. The Drizzle repos (`src/server/db/repos.ts`) are used only when `DATA_SOURCE=db`; anything else, including a `DATABASE_URL` with no flag, selects the mock repos. Vercel currently stays on mock (`DATA_SOURCE` unset) by decision; switching it to the database needs the Clerk keys and webhook endpoint in place first.
- Auth (Milestone 2, added 2026-10-13). Auth mode is derived in `src/lib/authMode.ts`: **clerk** when both Clerk keys exist and `DATA_SOURCE=db`, otherwise **stub** (every visitor is the sample user; this is mock mode and CI). On Vercel, `DATA_SOURCE=db` without Clerk keys throws at startup.
  - `src/lib/auth.ts` is the only caller of Clerk's session API: `getActor()` → `{ userId, role, locale, secondFactorVerified }`. Our user id, role and status come from the `users` mirror (one lookup per authenticated request), not from custom session claims. Clerk `publicMetadata.role` is the source of truth for the role and reaches the mirror by webhook, so a role change made in the Clerk dashboard applies when the webhook lands.
  - A signed-in user with no mirror row is provisioned on the spot from the Clerk API with the same upsert the webhook uses.
  - `src/server/auth/`: `clerkSync` (idempotent via `webhook_events`; events older than `users.clerk_updated_at` are ignored; deletion scrubs personal data), `actor` (`requireActor`, `requireRole` with user < editor < admin, `requireSecondFactor`), `audit`, `adminUsers`.
  - The proxy covers `/api/*`: mutating calls must be same-origin (`Sec-Fetch-Site` or `Origin`); `/api/webhooks/*` is exempt and signature-verified. In clerk mode every page except `/welcome`, `/sign-in`, `/sign-up` and the public `/holidays` pages requires a session; step pages (`/[locale]/path/[stepId]`) included. The page check is the pure function `pageGate` (`src/lib/pageGate.ts`, unit-tested); it asks for the session only when the page needs one, as before.
  - Admin area (`/[locale]/admin`, `PATCH /api/admin/users/[id]`): admins only since 2026-10-13 (editors get a 404 like everyone else), and only in a session where a second factor was verified. Admin mutations write `audit_log`. An admin cannot change their own role or block themselves.
- Catalog management (Milestone 3a, added 2026-10-13). `src/server/catalog/` holds the rules and is storage-agnostic: `service.ts` (save, delete, publish, ordered links, step order), `schemas.ts` (zod input shapes, shared with the admin forms), `access.ts`, `public.ts`. Storage sits behind `AdminCatalogRepo` and `CatalogRepo`, implemented by `src/server/db/adminCatalog.ts` + `catalog.ts` and by the in-memory `src/server/mock/`; both pass the same test suite (`catalog.test.ts`).
  - Who: `requireRole(actor, ADMIN_ROLE)` (admin; one constant to open it to editors) and a verified second factor, in every operation. Every change writes `audit_log`. **Requiring a second factor for catalog writes depends on the open Clerk MFA/plan decision (see Open risks); if MFA turns out to need a paid plan, option (b) there applies to the catalog as well.**
  - Translations: `he` is required, other locales optional. A translation missing from a save is deleted. Slugs are unique per locale (checked before the write, and the unique violation is mapped to the same error).
  - Writes: ids are generated in the service (`crypto.randomUUID()`), the row and its translations are upserts, and they go through `atomic()` (`src/server/db/atomic.ts`): one `db.batch([...])` on Neon's HTTP driver, which runs as a single transaction, and `db.transaction` on PGlite in tests. The batch path is covered by a unit test with a fake driver, not yet against Neon.
  - Deletes: a category or teacher that any lesson still points at is refused with the count; a lesson only while it is a draft and has no `user_lesson_progress` rows; a track only while it is a draft; steps and glossary terms go with their links.
  - API: `POST /api/admin/catalog/{entity}`, `PUT|DELETE /api/admin/catalog/{entity}/{id}`, and `POST …/lessons/{id}/publish|unpublish|terms`, `…/tracks/{id}/publish|unpublish|steps-order`, `…/steps/{id}/lessons`. Entities: `categories`, `teachers`, `lessons`, `terms`, `tracks`, `steps`. Not in 3a: media, captions, `parsha_code`/`holiday_code` on lessons, search.
  - `MOCK_ROLE=admin` (local only) makes the sample visitor an admin with a second factor, so the admin screens work with no keys. It is honoured only on mock data (never with `DATA_SOURCE=db`, so it cannot write to a database), with stub sign-in, when `VERCEL` is unset and `NODE_ENV` is not `production`; while Clerk is active it is ignored with a warning (`resolveMockRole` in `src/lib/authMode.ts`, unit-tested). Because production builds ignore it, the admin e2e tests run on a second, dev-mode server.
  - `MOCK_USER=new` (local only, added 2026-11-05) makes the stub visitor the fictional sample learner David, who has no progress, so the first-run screens can be used and tested. Same conditions as `MOCK_ROLE` (`resolveMockUser`, unit-tested). The e2e suite runs it on a third dev server (port 3102), so its in-memory progress never mixes with the sample user's.
- Seed: `pnpm db:seed` upserts fictional sample content (`src/server/db/seed.ts`, same data as the mock repos) and refuses to run when `NODE_ENV=production`.
- DB: Drizzle over Neon pooled string (transaction-mode PgBouncer), `pg` Pool size 1–2 per invocation, or `@neondatabase/serverless` HTTP driver for single-shot queries. Migrations run in CI, never at runtime.
- CSRF: middleware rejects mutating `/api/*` requests unless `Sec-Fetch-Site: same-origin` or `Origin` matches. Webhook routes are exempt and signature-verified.
- Rate limiting: `@upstash/ratelimit` sliding window per IP and per user; tight buckets on `/api/play`, `/api/billing/*`, `/api/telemetry/*`. Vercel managed WAF rules on top.
- Webhooks: verify signature on raw body → insert `webhook_events` (unique → idempotent) → process inline → 200. Bunny's webhook is unsigned: the payload is a hint and the handler re-fetches video state from the Bunny API; the route path carries a random secret.
- Cron (`CRON_SECRET` header): `/api/cron/billing` (dunning + reconciliation) and `/api/cron/rollups`, daily.
- No request body > 4.5 MB passes through handlers; all media and asset uploads go browser → Bunny/R2 directly.

### 1.3 Database schema (Neon Postgres 16)
Identity (migrated 2026-10-12 in `drizzle/0001_users_progress.sql`, which also enables the `citext` extension)
- `users` — id uuid, clerk_user_id unique, email citext, name, role enum(user|editor|admin), status enum(active|blocked|deleted), locale enum(he|en|ru|es), phone_enc, created_at, last_seen_at. Synced by Clerk webhooks.

Billing
- `plans` — id, code, interval enum(month|year), price_cents, currency, provider_price_ref, active. Display names from i18n messages keyed by `code`.
- `subscriptions` — id, user_id, plan_id, provider, provider_customer_ref, provider_subscription_ref, payment_token_ref, status enum(trialing|active|past_due|canceled|expired|paused), current_period_start/end, next_charge_at, retry_count, grace_until, cancel_at_period_end, canceled_at. Partial unique: one non-terminal subscription per user.
- `payments` — id, user_id, subscription_id, provider, provider_payment_ref unique, amount_cents, currency, status enum(pending|succeeded|failed|refunded), failure_code, receipt_url, paid_at.
- `webhook_events` — id, provider enum(clerk|psp|bunny), event_id, type, payload jsonb, received_at, processed_at, error. Unique (provider, event_id).

Catalog (localized; fallback chain: requested locale → `he`)
- `categories` — id, kind enum(holiday|parsha|halacha), parent_id, sort_order, hebcal_code (the holiday name as `@hebcal/core` spells it, e.g. `Chanukah`; "next holiday" is the next calendar event whose code has a published lesson, and that lesson's description is the card text)
- `category_translations` — pk(category_id, locale), name, slug. Unique (locale, slug).
- `teachers` — id, created_at (added 2026-10-12)
- `teacher_translations` — pk(teacher_id, locale), name
- `lessons` — id, category_id, teacher_id, duration_sec, access enum(free|members; renamed from `subscriber` in `drizzle/0003_lesson_access_key_points.sql`, generated 2026-10-13; applied by the owner to a fresh Neon dev database, with the seed), status enum(draft|processing|published|archived), published_at, thumbnail_key, parsha_code, holiday_code, created_by
- `lesson_translations` — pk(lesson_id, locale), title, description, key_points text[] (migration 0003), slug, search_vector tsvector GENERATED (`english`/`russian`/`spanish` for en/ru/es, `simple` for he) + GIN; `pg_trgm` GIN on title. Unique (locale, slug).
- `lesson_subtitles` — pk(lesson_id, locale), r2_key, bunny_synced_at (null = not synced yet or the sync failed), source enum(manual|auto), updated_at
- `video_assets` — id, lesson_id unique (one current video per lesson; replacing it deletes the old row and the old provider video), bunny_video_id unique, bunny_library_id, status enum(created|uploading|processing|ready|error), duration_sec, thumbnail_url (the provider's generated image), ready_at, raw jsonb, created_at
- Both media tables: `drizzle/0004_media.sql`, generated 2026-10-13, **not applied** to any database yet. `lessons.thumbnail_key` (an uploaded image that overrides the provider's) already existed.
- `lesson_attachments` — id, lesson_id, r2_key, name, mime, size, locale (nullable = all)

Learning path and glossary (proposed 2026-10-11, **approved 2026-10-12**; in `src/server/db/schema.ts`, migration `drizzle/0000_init.sql`, together with the catalog tables they reference: `categories`, `category_translations`, `teachers`, `teacher_translations`, `lessons`, `lesson_translations`. Not yet applied to Neon. In that migration `lessons.category_id` is nullable, since a path lesson need not belong to a holiday/parsha/halacha category; `lessons.created_by` references `users` since migration 0001; search columns on `lesson_translations` come with search in Milestone 3.)
- `tracks` — id, code unique, sort_order, status enum(draft|published). One track at launch (the conversion path); the table keeps a second track possible without a schema change.
- `track_translations` — pk(track_id, locale), name, slug. Unique (locale, slug).
- `track_steps` — id, track_id, sort_order. Unique (track_id, sort_order).
- `track_step_translations` — pk(step_id, locale), name, slug.
- `track_step_lessons` — pk(step_id, lesson_id), sort_order. A lesson keeps its `category_id`, so the path and the holiday/parsha/halacha catalog stay independent and one lesson can sit in both.
- `glossary_terms` — id, code unique, sort_order
- `glossary_term_translations` — pk(term_id, locale), term, short_definition, slug. Unique (locale, slug).
- `lesson_glossary_terms` — pk(lesson_id, term_id), sort_order. Drives "Words from the lesson"; a term is underlined in a lesson title when its translated `term` appears there literally.
- No new progress table. Step status is derived, from **published** lessons only (drafts neither count nor carry progress; lesson numbers are positions among published lessons): completed = every published lesson of the step has `user_lesson_progress.completed_at`; in progress = some have progress; "up next" = the first untouched step that has a published lesson; a step with none is "coming soon". "Continue watching" = the latest `user_lesson_progress.updated_at` without `completed_at` whose lesson is still published. "Start" (when nothing is under way) = the first lesson in path order with a ready video and no `completed_at`. The rules live in `src/server/catalog/path.ts`, shared by the database and mock repos (decided 2026-11-05).
- Home's main card (2026-11-08), `homeState` in `path.ts`, first match wins: **Continue** when a lesson is under way (as above); **Finished** when the path has published lessons and all are completed (no button, a calm notice); **Start** on the Start lesson, worded as a first start only when no published lesson is completed (otherwise it reuses "here is your next lesson"); **Empty** ("lessons are being prepared") when nothing is published or the next lesson's video is not ready. Progress on lessons unpublished since counts for nothing, so such a learner gets a first Start; a lesson published after the path was finished is the next Start. Finished and Empty come from `getSteps` counts; Start is queried only when it decides. Unit-tested on both storages in `path.test.ts`.
- Step page (`/[locale]/path/[stepId]`, 2026-11-05): the step's published lessons in order with their state (completed, stopped at, up next, being prepared), and one action: "Start" or "Continue" on the step's next lesson (the first ready lesson not done), or "You finished this step" with a link to the next step. Per user, so dynamic; no static params. An unknown id, or a step with no published lesson ("coming soon" on `/path`, not a link), is a 404. **Known limitation:** the action points to the first open lesson in the step's order even when the learner is half-way through a later one (they skipped a lesson); that later row still shows its stop point. Unit-tested in `path.test.ts`.
- 404 pages: `src/app/[locale]/not-found.tsx` is the localized 404 for every page under a site language, both a page's `notFound()` and unknown addresses, which reach it through the catch-all `src/app/[locale]/[...rest]/page.tsx` (dynamic, never prerendered). `/ru` and `/es` are rejected by the `[locale]` layout itself and get the framework's default 404.
- Error pages (2026-11-08, launch item A6): `src/app/[locale]/error.tsx` catches any error while a page under a site language renders and shows, in the visitor's language, one heading (focused on arrival), one plain sentence, "Try again" and "Back to the home page" (locale-aware link), never a message or a stack. "Try again" calls Next's `retry` (refresh from the server, then clear the error; `reset` alone would only re-render what the browser already has) and is disabled until a new error arrives, so a double click sends one refresh. A small "Reference: <digest>" line appears for errors thrown on the server; errors thrown in the browser have no digest and no line. `notFound()` still reaches `not-found.tsx`. `src/app/global-error.tsx` replaces the root layout when that layout fails (production builds only): its own `<html>`, the shared Rubik font (`src/lib/font.ts`) and text-size script, Hebrew first and English below with the strings imported from `he.json`/`en.json` (no next-intl there), one reload button per language, and the same reference line. It has no committed test (a hook in the root layout would make every page dynamic); it was checked once with a scratchpad harness (patched copy, production build).
- Error log: nothing of our own. On the server Next prints `⨯ Error: <message>`, one frame of the minified server bundle and `digest: '<digest>'` for every render error (checked on `next start`; Vercel keeps the server's output in its logs), and that digest is the one on the page. The line has no request address, query, headers or token; our own error messages never carry keys or signed addresses.
- Test-only error page: `/[locale]/dev/error` fails on purpose so the e2e suite can show the error page (`?once=<key>` fails once, then renders; `?client=1` fails in the browser). It uses the fake media routes' switch (`fakeRoutesEnabled`: both media adapters are the fakes and `VERCEL` is unset), so on Vercel, or with Bunny or R2 configured, it calls `notFound()` and never fails; unit-tested in `src/lib/devErrorPage.test.ts`.
- Same fallback chain as the catalog (requested locale → `he`); `he` rows are required.

Telemetry
- `playback_sessions` — id, user_id, lesson_id, started_at, last_heartbeat_at, last_position_sec, watched_sec, max_position_sec, completed, device, user_agent, ip_hash. Index (user_id, last_heartbeat_at).
- `user_lesson_progress` — pk(user_id, lesson_id), last_position_sec, watched_pct, completed_at, updated_at (migrated 2026-10-12; `completed_at` is set once at ≥ 95% watched and never cleared, `watched_pct` never decreases)
- `daily_lesson_stats`, `daily_platform_stats` — daily rollups

Ops (`audit_log` and `webhook_events` migrated 2026-10-13 in `drizzle/0002_auth_ops.sql`, with `users.clerk_updated_at`)
- `audit_log` — actor_id, action, target_type, target_id, diff jsonb, ip, created_at

Storage separation
- Relational → Neon. Nightly `pg_dump` from the cron route to R2 (free tier keeps 6 h PITR only).
- App assets → R2 via presigned PUT; public bucket behind Cloudflare CDN; `next/image` loader points at it.
- Video → Bunny Stream only; browser uploads via tus with a server-issued signature.

### 1.4 Video (Bunny Stream)
- Library settings, **not turned on yet**: token authentication, allowed referrers = app domains, block direct file access; MediaCage off. They stay off until signed playback has been tried against a real library (none exists during the MVP).
- Play flow as built (Milestone 4, 2026-10-29): `POST /api/play {lessonId}`, same-origin checked by the proxy like every mutating API call → signed-in actor (401 `signed_out`) → published lesson (404 `not_found`) → `canWatch` (403 `members_only`) → stored video `ready` (409 `video_not_ready`) → `provider.playbackUrl(videoId, expires)` with a 2 h TTL → `{ url, expiresAt }`, `cache-control: private, no-store` on every answer. `src/server/playback/service.ts` reads the stored video state only (never `provider.getVideo`, which is typed out of reach), writes nothing, and logs no address or key. The address is never in the HTML or the RSC payload: the player fetches it. Reserved: 409 `too_many_sessions` (M6), 429 `too_many_requests` (rate limit, Upstash, needs approval). M5 entitlement goes inside `canWatch`.
- Token schemes: the **fake** signs `videoId:expires` with HMAC-SHA256 under a per-process secret and serves one local 60 s clip (`dev-assets/clip`, outside `public/`) from `/api/dev/media/play/<videoId>/<file>?expires&token`, putting the token on every segment line; 403 on a tampered, expired or foreign token, 404 on Vercel or with a real provider. **Bunny** builds a CDN directory token, `base64url(sha256(BUNNY_TOKEN_SECURITY_KEY + "/<videoId>/" + expires))`, on `https://<pullzone>/<videoId>/playlist.m3u8?token&expires&token_path=/<videoId>/`, written from the documentation and **unverified**; it refuses `fake-` ids and names the variable when the key is unset. The token is bound to the video path, not to the viewer's IP (mobile addresses change).
- Player: hls.js, or the browser's own HLS where it has it (iOS; untested, the suite runs Chromium only); a loading line while the address is fetched; one alert with a plain-Hebrew message per answer and a large "try again" button; one quiet renewal on a fatal network error, continuing from the same second; a renewal before playing on when the address is under five minutes from expiry.
- Accepted limits: whoever holds a valid address can play it for up to 2 h; no DRM; the referrer lock is a library setting with the iOS caveat below.
- Heartbeat every 30 s → `POST /api/telemetry/heartbeat` → UPSERT into `user_lesson_progress` (as built). Client batching and the `playback_sessions` row come with M6. No Redis on this path.
- Saving the place (2026-11-05): besides the 30 s heartbeat, the player saves on pause, at the end of the video (`ended: true`, which sets `completed_at` once and `watched_pct = 100` for a published lesson, whatever the stored length), and when leaving: `visibilitychange → hidden` and `pagehide` send a `navigator.sendBeacon` (falling back to `fetch` with `keepalive`), and unmounting the player (navigation inside the app) does the same. Not `beforeunload`. `src/lib/progressSaver.ts` decides what is sent: nothing below 1 s or at the stop point the server already has, never the same position twice (marked at dispatch, rolled back when a request fails), and nothing after a 401 until `/api/play` issues a new address. Accepted: the last request to arrive sets the stop point, so a delayed earlier save can win (rare; at most one heartbeat interval).
- End of a lesson (2026-11-08): when the video ends, a card under the video offers one main action, never an automatic advance: the next ready lesson in path order ("A new step begins" when it opens the next step); at the end of the path "Back to my path", headed "You finished the path" only when every other published lesson is done, otherwise "This is the last available lesson for now" (it also covers a learner who skipped lessons, and a next lesson whose video is not ready); for a lesson outside the path "Back to the home page". "Watch again" restarts. `lessonEnd` in `path.ts` decides (unit-tested on both storages); `pathRepo.getLessonEnd` runs at render only when the player is shown (one path query plus the next lesson, in parallel with the stop point), and its step id is where "Back" goes (home for a lesson outside the path), after the capped wait for the save. The card appears on `ended` without waiting for that save; focus moves to the main button only when the card appears, and the button is described by the card's heading. **Staleness:** the card uses what was true when the page was rendered; if the next lesson is unpublished or its video stops being ready during a long session, its link leads to the 404 page or the player's "still being prepared" message. **Fullscreen:** the card is outside the video, so on `ended` the player leaves fullscreen first (`document.exitFullscreen`, or `webkitExitFullscreen` for the iOS native player when `webkitDisplayingFullscreen`). Our controls offer no fullscreen today, so this is defensive. Tested with the real Fullscreen API in Chromium (stable over 10 consecutive runs per screen size). **Not verified:** iOS Safari's native fullscreen player (whether it leaves fullscreen and shows the card), and Android Chrome's rotate-to-fullscreen; to be tested on real devices.
- Milestone 6, sessions and the 2-device limit: `/api/play` creates a `playback_sessions` row and returns `sessionId`; the heartbeat carries it; a third live session is refused with 409 `too_many_sessions` and the list of live sessions. Sessions must expire on their own (no heartbeat for a few minutes frees the slot), the refusal must be a plain Hebrew message naming the other device, and the viewer must get a "sign out the other device" button that ends it and continues here, because the audience is older and non-technical. Clients already ignore unknown response fields.
- Subtitles: admin uploads VTT per language → R2 master → sync to Bunny captions → subtitle track in the HLS manifest. Bunny auto-transcription can seed tracks for review (paid per minute, optional).
- Forensics (M6): the token carries no claims; `playback_sessions` maps session → user, IP hash, UA.
- Test early: iOS native HLS may not send `Referer`. If the referrer lock breaks iOS playback, rely on token auth only.

Uploads and captions (Milestone 3b, implemented 2026-10-18):
- **Two interfaces in `src/server/media/`**, written with plain `fetch` and `node:crypto` (no SDKs, no `next/*`): `MediaProvider` (create video, upload target, status, captions, delete) with `BunnyMediaProvider`, and `FileStorage` (presigned browser PUT, server-side put/get/exists/delete, public URL) with `R2FileStorage` (SigV4 written in-house and tested against AWS's published example). Each has an in-memory fake.
- **One switch, opt-in only** (`src/server/media/index.ts`): `MEDIA_PROVIDER=bunny` and `FILE_STORAGE=r2` select the real adapters; anything else, including keys on their own, selects the fakes. A real adapter with a missing key fails on first use and names the variable, never its value. `FAKE_MEDIA_PROCESSING_MS` sets how long the fake "encoding" takes (default 3 s).
- **Status changes in one place**: `refreshVideo` in the media service asks the provider for the video's state. The admin screen polls it, and the Bunny webhook (`/api/webhooks/bunny/<secret>`, no session, 404 unless `MEDIA_PROVIDER=bunny` and the secret matches) only records the event and calls the same function. When a video becomes ready, the lesson gets its duration and unsynced captions are sent to the provider.
- **Publish rule**: a lesson can be published only when its video is `ready` (`409 video_not_ready`). Lessons published before 3b stay published; sample lessons have a ready sample video.
- **Captions go through the app**, the one exception to "browser → storage directly": they are small, must be validated (`WEBVTT`, ≤ 1 MB, UTF-8), and Bunny's captions API needs the content anyway. Viewers read them from `GET /api/captions/<lesson>/<locale>` (checks `canWatch`, `text/vtt`, `nosniff`, `private, no-store`), never from a public bucket. Thumbnails are read from the private bucket by `GET /api/thumbnails/<key>` (added 2026-10-19; only keys in the shape the upload creates, cached as immutable since every upload gets a new key); the bucket has no public access. A failed sync keeps the caption unsynced, with "sync again" in the admin.
- **Thumbnail**: an uploaded image overrides the one the provider generates; the home "continue watching" card shows it.
- **Fake safety**: `/api/dev/media/*` answers only when both adapters are fakes and `VERCEL` is unset; fake video ids start with `fake-`; the admin media section shows a "fake media" banner.
- **Deleting a draft lesson** removes database rows first, then the provider video and files best-effort; a cleanup failure is audited (`media.cleanup_failed`) and does not fail the delete.
- Deferred: in-manifest captions for iOS (they come with Bunny playback, untested); attachments; Bunny auto-transcription; cron retry of failed caption syncs; thumbnails on the public holiday pages (not sketched). Open M4 check: once token authentication is on, the provider's thumbnail may need a signed URL; if so, copy it into `FileStorage` when the video becomes ready.
- Deviations from the 3b plan: the admin media UI is one component (`LessonMediaPanel`) instead of three, and the home card draws the thumbnail as a CSS background image instead of an `<img>` (it is decorative either way).

Cost at launch scale (Volume CDN tier, EU PoPs serve Israel at ~50 ms):

| Item | Assumption | USD/month |
|---|---|---|
| Bunny storage | 200 h ≈ 200 GB × $0.01 | ~2 |
| Bunny delivery | 1200 viewing h ≈ 840 GB × $0.005 | ~4 (min $1) |
| Vercel | Hobby / Pro | 0 / 20 |
| Neon, Upstash, Clerk, R2, Resend | free tiers | 0 |
| Clerk MFA for the admin area | only if the free tier does not cover it in production; price not verified | unknown |
| Total | excluding Clerk MFA if it turns out to be paid | ~6 (Hobby) / ~26 (Pro) |

### 1.5 Caching
- Upstash: `rl:*`, `ent:{userId}` (TTL 60 s), `blocked:{userId}`, `live:viewers`, `live:lesson:{id}`. Budget ≈ 1 op per API request, well under the free quota.
- Next.js data cache / ISR: catalog tree, lesson lists and pages per locale, tag-invalidated on publish.
- CDN: Vercel edge for pages/static; Cloudflare for R2; Bunny CDN for video.
- Never cached: per-user API responses (`private, no-store`), playback tokens.

### 1.6 Security
- Headers (decided 2026-11-08, launch item A7): sent from `next.config.ts` `headers()` on every route (pages, pre-rendered pages, API, static files), built by `src/lib/csp.ts` (unit-tested per mode). Enforced: `Strict-Transport-Security: max-age=604800` (one week while the production domain is not final; once it is, and every subdomain serves HTTPS only, raise to `max-age=63072000; includeSubDomains`, and add `preload` only together with a submission to hstspreload.org, which is hard to undo), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin-allow-popups`, `Permissions-Policy` (camera, microphone, geolocation, payment, usb off; fullscreen and picture-in-picture for the site itself; revisit `payment` when billing picks a provider), and no `X-Powered-By`. No COEP or CORP: they would block Clerk avatars and Bunny media.
- Content-Security-Policy: one policy for every route. `script-src 'self' 'unsafe-inline'`, plus the Clerk Frontend API host (read from the publishable key) and `https://challenges.cloudflare.com` in Clerk mode only, and `'unsafe-eval'` (with `ws://localhost:*` in `connect-src`) under `next dev` only; `style-src 'self' 'unsafe-inline'`; Bunny's pull zone (`img`, `media`, `connect`) and upload host, and R2's S3 host (`connect`), only when `MEDIA_PROVIDER=bunny` / `FILE_STORAGE=r2`; `media-src` and `worker-src` allow `blob:` for hls.js; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. Clerk telemetry is turned off (`NEXT_PUBLIC_CLERK_TELEMETRY_DISABLED`) instead of being allowed. **Report-only for now** (`Content-Security-Policy-Report-Only`): violations show in the browser console only, there is no report endpoint, and `CSP_MODE=enforce` sends the enforcing header (local test runs; the launch step in README, "Security headers"). Browsers ignore `frame-ancestors` in a report-only policy, so `X-Frame-Options: DENY` is what prevents framing today. **Why no nonce:** Next adds a nonce only to pages rendered per request, so a nonce policy would make the holiday catalog (ISR) dynamic or need a second policy for it; and no component renders user- or admin-supplied HTML (the only `dangerouslySetInnerHTML` is the constant text-size script), with React escaping everything else, so `'unsafe-inline'` costs little today. **Later upgrade:** if user-supplied HTML ever appears (for example admin rich text), move per-request pages to a nonce with `'strict-dynamic'` (Next reads the nonce from the request's CSP header set in the proxy) and decide then how the ISR pages are served.
- SQLi: Drizzle parameterized queries only; app DB role has no DDL; migrations use a separate role.
- XSS: React escaping; admin rich text sanitized server-side (DOMPurify + jsdom whitelist); CSP backstop.
- CSRF: same-origin check in middleware for mutating `/api/*`; Clerk cookies `SameSite=Lax`; webhooks signature-only.
- Auth: Clerk handles credentials, breach detection, bot protection, email verification. Server enforces role claim, `status != blocked`, and a verified second factor for `/admin/*`.
- Rate limiting: Upstash sliding window + Vercel WAF; login/signup protected by Clerk's limits and bot detection.
- Data protection: PII minimized (Clerk holds credentials); AES-256-GCM for stored phone; Neon encrypted at rest; no card data (PSP tokenization, PCI SAQ-A); IP hashed in telemetry; log redaction; export/delete endpoints.
- Webhooks: signature verification, idempotency table, Bunny payload re-validated via API, nightly PSP reconciliation.
- RBAC + audit: `requireRole()` in every admin handler; `audit_log` on all mutations.
- Supply chain / secrets: pnpm lockfile, Dependabot, Vercel sensitive env vars, rotation runbook for Bunny security key, PSP secrets, Clerk secret, `CRON_SECRET`.

### 1.7 Billing
```ts
interface BillingProvider {
  createCheckout(user, plan, locale): Promise<{ url: string }>;
  cancel(subscription): Promise<void>;
  chargeRecurring?(subscription): Promise<PaymentResult>;   // PayPlus token charge; absent for Stripe
  parseWebhook(rawBody, headers): NormalizedBillingEvent[]; // verifies signature
  reconcile(subscription): Promise<RemoteState>;
}
```
- State machine in our code: `active → past_due (retry +1d, +3d, +7d) → expired`; `grace_until = period_end + 7d`. Entitlement = `status in (trialing, active) OR (past_due AND now < grace_until)`.
- Stripe adapter: events drive transitions, Smart Retries on. PayPlus adapter: daily cron charges due tokens and drives transitions. Checkout and emails in the user's locale.

### 1.8 Scale path (no rewrite)
1. Vercel Pro + Neon Launch (no cold starts, more connections) + Upstash pay-as-you-go. Hourly crons.
2. Inngest for background jobs when inline webhooks or email fan-out get slow.
3. If telemetry or playback QPS outgrows serverless economics, lift `src/server/` into a Fastify/NestJS service; route handlers contain no logic.

## 2. Edge cases carried into implementation
1. Vercel Hobby non-commercial terms.
2. iOS native HLS + Bunny referrer lock; test before enabling.
3. Bunny webhook unsigned → re-fetch state; random path secret.
4. Neon scale-to-zero cold start (~0.5 s) after idle; removed by Neon Launch.
5. Serverless DB connections → pooled Neon string, tiny pools, no long transactions.
6. Account sharing → 2 concurrent sessions via `playback_sessions`, visible in admin.
7. Webhooks out of order / duplicated → idempotency + deterministic state machine + reconciliation.
8. Partial translations → fallback to `he`; admin shows per-language completeness; slugs unique per locale; locale switch resolves by id.
9. Hebrew search = trigram; en/ru/es = language-specific tsvector.
10. Upstash free quota → Redis never on the heartbeat path.
11. Subtitles must be in-manifest (not `<track>`) for iOS; captions sync retried from cron on failure.
12. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is baked into the client bundle at build time, while the secret key is read at runtime. Changing Clerk keys needs a rebuild or redeploy; otherwise browser and server talk to different Clerk instances and sign-in fails with a handshake error.

## 3. Milestones

Repo layout (single Next.js app; the `app` directory lives under `src/`):
```
src/app/[locale]/(public|app|admin)/...    src/app/api/...    src/server/...    src/i18n/messages/{he,en,ru,es}.json
drizzle/ (schema + migrations)    .github/workflows/ci.yml    vercel.json (crons, headers)    design/ (concepts)
```

0. **Design pick** → `design/DESIGN_CONCEPTS.md` + five HTML mockups; user selects the UI direction. Done 2026-10-11: `design/final-sketch.pdf`.
1. **Scaffold** → Next.js + TS + Tailwind (logical props) + `next-intl` + Clerk + Drizzle/Neon + Upstash + Vercel + CI. Verify: locale routing with correct `dir`, sign-in in all 4 languages, `/api/healthz` hits Neon.
2. **Users & roles** → Clerk webhooks → `users` mirror, `verifyRequest`/`requireRole`, admin MFA gate, audit log. Verify: webhook replay idempotent; admin route rejects non-MFA session. Implemented 2026-10-13. Verified live on a Clerk development instance and the Neon dev branch: session sign-in, user row created on first request, per-user progress, 404/403 for non-admins, admin without a second factor refused on page and API, sign-out, 401 on heartbeat when signed out. **Not verified yet:** the positive second-factor path (an admin with an authenticator app entering `/admin`), real webhook delivery from Clerk (needs a public URL), and the name fields on the sign-up form.
3. **Catalog + i18n content** (split 2026-10-13 into **3a** admin catalog without media + public holiday pages with ISR, implemented 2026-10-13 and tested on mock data and PGlite; the owner applied all four migrations and the seed to a fresh Neon dev database, on which 3a has not been exercised yet; **3b** R2 and Bunny uploads, captions, implemented 2026-10-18 on the fakes (see §1.4) and merged. Verified in October 2026 against a real Bunny library (not from the admin screen): create video, tus upload, status, captions, delete; against a real R2 bucket, end to end: presigned browser `PUT` with bucket CORS and the `/api/thumbnails/<key>` route reading the file back from the private bucket. **Not verified** (the Bunny trial ended, and no second account during the MVP): the admin screen's browser upload flow against real Bunny, real Bunny webhook delivery, Bunny playback (Milestone 4), and CORS for the production and preview domains. Migration 0004 not applied. Caveat: the seeded sample video ids are fake and unknown to Bunny; a status refresh with `MEDIA_PROVIDER=bunny` marks them `error`; **3c** search) → CRUD with per-language tabs, translation tables, R2 presigned uploads, Bunny create + tus + encoding webhook, captions sync, ISR pages per locale, search. Verify: `he`-only lesson falls back on `en` page; VTT appears as a track in the manifest.
4. **Playback** → implemented 2026-10-29 on the fake provider, in three PRs (#10 provider signing, fake CDN and local clip; #11 `/api/play`; #12 player). Tested without any account: unit tests on PGlite and mock for the order of checks (signed-out refused with no reads, draft 404 before `canWatch`, 403 before 409, 502 that names nothing, the provider's state method never called), the fake token (valid, expired, tampered, other video, other process), the Bunny address against a fixture, the fake CDN route (clip bytes, token on every segment, path traversal 404, 404 on Vercel or with a real provider); e2e on the fake (403 without our origin, 400, 404, 200 with `private, no-store`, playlist and segments through the address, tampered and expired 403, draft 404 → published 200 → unpublished 404, the player plays the clip, the page carries no `.m3u8`). **Not verified until a real Bunny account exists:** the token formula and parameter names, the library switches, playback of a real upload, iOS native playback with in-manifest captions, the referrer lock on iOS, provider thumbnails once token authentication is on. **Deferred:** sessions, the 2-device limit and the watermark (M6, see §1.4); rate limiting (Upstash, needs approval); heartbeat into `playback_sessions`. Of the original checks: expired and foreign tokens rejected (done, on the fake); iOS native playback with subtitles (open); third concurrent session rejected (M6); resume across devices (progress is per user; the e2e covers one device).
5. **Billing** → `BillingProvider` + chosen adapter, localized checkout, webhooks, state machine, daily cron, entitlement invalidation, Resend emails. Verify: state-machine unit tests with recorded fixtures; canceled user loses `/api/play` within 60 s.
6. **Admin dashboard** → CRM, payment history, per-user viewing telemetry, live viewers, rollup charts, audit log, translation completeness. Verify: dashboard numbers equal SQL ground truth.
7. **Hardening & launch** → CSP, rate limits, Vercel WAF, Sentry, OWASP ZAP baseline, k6 on `/api/play` + heartbeat, backup restore drill, key-rotation runbook, Pro-plan switch checklist.

## 4. Verification
- Unit: billing state machine, entitlement, Bunny token signing (formula only, see Milestone 4), fake playback token, locale fallback.
- Integration: Clerk/PSP/Bunny webhook fixtures replayed twice; role guards; pooled-connection behavior under parallel invocations.
- E2E (Playwright, mobile viewport, all 4 locales incl. RTL): sign-up → subscribe → play with subtitles → resume on second device → cancel → access revoked.
- Load: k6 on `/api/play` and heartbeat; Neon connection count stays flat as concurrency rises.
- Security: ZAP baseline, header scan, signed-URL negative tests (done on the fake CDN; to repeat against Bunny), dependency audit in CI.
