# Akademya Habraham — Architecture

Community VOD and subscription platform for recorded Torah lessons (Holidays, Weekly Parsha, Halacha).
Launch target: < 1k users, < 200 h of video, near-zero running cost, four languages (he RTL, en/ru/es LTR).
Design constraint: stateless and horizontally scalable from day one.

Decided 2026-10-07. Update this file when a decision changes.

Decision 2026-10-11: Milestone 0 is closed. The UI follows `design/final-sketch.pdf`, which replaces the five concepts and is the visual source of truth. The audience is older adults, so tap targets are ≥ 48 px, contrast is WCAG AA or better, and every icon has a text label.

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
- Locale resolution: URL prefix → `users.locale` → `Accept-Language` → `he`. Hebrew calendar dates shown alongside Gregorian.
- Text size (added 2026-10-11): three levels (`s|m|l`) stored in the `ah_text_size` cookie. The root layout reads it and sets `data-text-size` on `<html>`, which changes the root font-size (100% / 112.5% / 125%), so SSR renders the right size with no flash. All sizes are in rem. A missing cookie means a first visit and redirects to `/[locale]/welcome`. Since 2026-10-13 (Milestone 3a) no layout reads the cookie: the server always renders the default size and an inline script in `<head>` (`TEXT_SIZE_SCRIPT` in `src/lib/prefs.ts`) sets the attribute before the first paint, so pages can be static. The script is a constant; when CSP arrives (Milestone 7) allow it by hash, not by nonce, since a nonce would make every page dynamic again.
- Clerk `clerkMiddleware()` guards `/[locale]/app/*` and `/[locale]/admin/*`; `<ClerkProvider localization>` per locale.
- Public catalog pages: ISR per locale, tag-revalidated on publish. Authenticated pages: TanStack Query → same-origin `/api/*`.
  - Built in Milestone 3a (2026-10-13), holidays only: `/[locale]/holidays` (holiday categories with at least one published lesson), `/holidays/[slug]` (its published lessons) and `/holidays/[slug]/[lessonSlug]` (a preview: title, short description, key points and a button; never the player). They live in the `(public)` route group, whose layout and header read nothing from the request. Signed-out visitors can open them, and they skip the first-visit redirect to `/welcome`. Parsha and halacha pages are not built.
  - Data is read through `unstable_cache` wrappers in `src/lib/catalogCache.ts`, tagged `catalog`, with `revalidate = 3600` as a backstop. Every successful admin catalog write calls `revalidateTag("catalog", "max")`: the next visit is served the old page while a fresh one is built.
  - `generateStaticParams` goes through `safeStaticParams` (`src/lib/staticParams.ts`). If the catalog cannot be read at build time (database unreachable, or a migration not applied yet, as on a preview deployment) it logs a warning and returns nothing, and the pages render on first request (`dynamicParams = true`). `STRICT_STATIC_PARAMS=1` makes that a build failure; use it for the checks before a pull request.
  - Slugs are per locale with the Hebrew slug as fallback. An address written with another language's slug resolves and redirects to the right one, so the language switch works on these pages.
  - Watching: `canWatch(actor, lesson)` in `src/server/catalog/access.ts`. Signed-out: no. `free`: any signed-in user. `members`: any signed-in user until billing exists (Milestone 5). **This is UI-level gating only**; real enforcement belongs in `/api/play` (Milestone 4).
- Player: hls.js (Android/desktop), native HLS (iOS). Subtitles come from the HLS manifest so they work natively on iOS; default track = UI locale. Server-side resume, ABR, speed, PiP, Media Session API, session watermark overlay.
- Admin dashboard: `/[locale]/admin`; role-gated in middleware and in every handler. Freshness ≤ 30 s via polling; live viewers from Upstash. Content forms have a tab per language; `he` required, others optional.

### 1.2 Backend
```
src/server/            # NO imports from next/* — portable to a standalone service
  db/        drizzle schema, migrations, repos
  auth/      verifyRequest(): Clerk claims → {userId, role, locale}; requireRole()
  catalog/   lessons, categories, translations, search
  playback/  entitlement, concurrency, bunny token signing
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
  - The proxy covers `/api/*`: mutating calls must be same-origin (`Sec-Fetch-Site` or `Origin`); `/api/webhooks/*` is exempt and signature-verified. In clerk mode every page except `/welcome`, `/sign-in`, `/sign-up` requires a session.
  - Admin area (`/[locale]/admin`, `PATCH /api/admin/users/[id]`): admins only since 2026-10-13 (editors get a 404 like everyone else), and only in a session where a second factor was verified. Admin mutations write `audit_log`. An admin cannot change their own role or block themselves.
- Catalog management (Milestone 3a, added 2026-10-13). `src/server/catalog/` holds the rules and is storage-agnostic: `service.ts` (save, delete, publish, ordered links, step order), `schemas.ts` (zod input shapes, shared with the admin forms), `access.ts`, `public.ts`. Storage sits behind `AdminCatalogRepo` and `CatalogRepo`, implemented by `src/server/db/adminCatalog.ts` + `catalog.ts` and by the in-memory `src/server/mock/`; both pass the same test suite (`catalog.test.ts`).
  - Who: `requireRole(actor, ADMIN_ROLE)` (admin; one constant to open it to editors) and a verified second factor, in every operation. Every change writes `audit_log`. **Requiring a second factor for catalog writes depends on the open Clerk MFA/plan decision (see Open risks); if MFA turns out to need a paid plan, option (b) there applies to the catalog as well.**
  - Translations: `he` is required, other locales optional. A translation missing from a save is deleted. Slugs are unique per locale (checked before the write, and the unique violation is mapped to the same error).
  - Writes: ids are generated in the service (`crypto.randomUUID()`), the row and its translations are upserts, and they go through `atomic()` (`src/server/db/atomic.ts`): one `db.batch([...])` on Neon's HTTP driver, which runs as a single transaction, and `db.transaction` on PGlite in tests. The batch path is covered by a unit test with a fake driver, not yet against Neon.
  - Deletes: a category or teacher that any lesson still points at is refused with the count; a lesson only while it is a draft and has no `user_lesson_progress` rows; a track only while it is a draft; steps and glossary terms go with their links.
  - API: `POST /api/admin/catalog/{entity}`, `PUT|DELETE /api/admin/catalog/{entity}/{id}`, and `POST …/lessons/{id}/publish|unpublish|terms`, `…/tracks/{id}/publish|unpublish|steps-order`, `…/steps/{id}/lessons`. Entities: `categories`, `teachers`, `lessons`, `terms`, `tracks`, `steps`. Not in 3a: media, captions, `parsha_code`/`holiday_code` on lessons, search.
  - `MOCK_ROLE=admin` (local only) makes the sample visitor an admin with a second factor, so the admin screens work with no keys. It is honoured only with stub sign-in, when `VERCEL` is unset and `NODE_ENV` is not `production`; while Clerk is active it is ignored with a warning (`resolveMockRole` in `src/lib/authMode.ts`, unit-tested). Because production builds ignore it, the admin e2e tests run on a second, dev-mode server.
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
- `lessons` — id, category_id, teacher_id, duration_sec, access enum(free|members; renamed from `subscriber` in `drizzle/0003_lesson_access_key_points.sql`, generated 2026-10-13, not yet applied to Neon), status enum(draft|processing|published|archived), published_at, thumbnail_key, parsha_code, holiday_code, created_by
- `lesson_translations` — pk(lesson_id, locale), title, description, key_points text[] (migration 0003), slug, search_vector tsvector GENERATED (`english`/`russian`/`spanish` for en/ru/es, `simple` for he) + GIN; `pg_trgm` GIN on title. Unique (locale, slug).
- `lesson_subtitles` — pk(lesson_id, locale), r2_key, bunny_synced_at, source enum(manual|auto)
- `video_assets` — id, lesson_id, bunny_video_id, bunny_library_id, status enum(created|uploading|processing|ready|error), duration_sec, ready_at, raw jsonb
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
- No new progress table. Step status is derived: completed = every lesson of the step has `user_lesson_progress.completed_at`; in progress = some do; "up next" = the first step after the current one. "Continue watching" = the latest `user_lesson_progress.updated_at` without `completed_at`.
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
- Library: token authentication on, allowed referrers = app domains, block direct file access on, MediaCage off.
- Play flow: `POST /api/play {lessonId}` → Clerk claims → entitlement (subscription status + grace; cached 60 s in Upstash, DEL on billing events) → concurrency: count `playback_sessions` with heartbeat in last 60 s, reject if ≥ 2 → create session row → sign Bunny token (SHA-256 of security key + video id + expiry; 2 h) → return `https://{pullzone}.b-cdn.net/{videoId}/playlist.m3u8?token=&expires=` + session id. Confirm parameter encoding against Bunny docs during milestone 4.
- Heartbeat every 30 s, client-batched → `POST /api/telemetry/heartbeat` → one UPSERT into `playback_sessions` + `user_lesson_progress`. No Redis on this path. Fire-and-forget on the client.
- Subtitles: admin uploads VTT per language → R2 master → sync to Bunny captions → subtitle track in the HLS manifest. Bunny auto-transcription can seed tracks for review (paid per minute, optional).
- Forensics: token carries no claims; `playback_sessions` maps session → user, IP hash, UA.
- Test early: iOS native HLS may not send `Referer`. If the referrer lock breaks iOS playback, rely on token auth only.

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
- Headers: HSTS, CSP with nonces (Clerk, Bunny CDN, R2 origins only), `frame-ancestors 'none'`, Referrer-Policy `strict-origin-when-cross-origin`, Permissions-Policy.
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
3. **Catalog + i18n content** (split 2026-10-13 into **3a** admin catalog without media + public holiday pages with ISR, implemented 2026-10-13 on mock data and PGlite, migration `0003` not yet applied to Neon; **3b** R2 and Bunny uploads, captions; **3c** search) → CRUD with per-language tabs, translation tables, R2 presigned uploads, Bunny create + tus + encoding webhook, captions sync, ISR pages per locale, search. Verify: `he`-only lesson falls back on `en` page; VTT appears as a track in the manifest.
4. **Playback & telemetry** → `/api/play`, player with subtitles, heartbeat UPSERT, resume, watermark. Verify: token rejected after expiry and from a foreign origin; iOS native playback with subtitles; third concurrent session rejected; resume across devices.
5. **Billing** → `BillingProvider` + chosen adapter, localized checkout, webhooks, state machine, daily cron, entitlement invalidation, Resend emails. Verify: state-machine unit tests with recorded fixtures; canceled user loses `/api/play` within 60 s.
6. **Admin dashboard** → CRM, payment history, per-user viewing telemetry, live viewers, rollup charts, audit log, translation completeness. Verify: dashboard numbers equal SQL ground truth.
7. **Hardening & launch** → CSP, rate limits, Vercel WAF, Sentry, OWASP ZAP baseline, k6 on `/api/play` + heartbeat, backup restore drill, key-rotation runbook, Pro-plan switch checklist.

## 4. Verification
- Unit: billing state machine, entitlement, Bunny token signing, locale fallback.
- Integration: Clerk/PSP/Bunny webhook fixtures replayed twice; role guards; pooled-connection behavior under parallel invocations.
- E2E (Playwright, mobile viewport, all 4 locales incl. RTL): sign-up → subscribe → play with subtitles → resume on second device → cancel → access revoked.
- Load: k6 on `/api/play` and heartbeat; Neon connection count stays flat as concurrency rises.
- Security: ZAP baseline, header scan, signed-URL negative tests, dependency audit in CI.
