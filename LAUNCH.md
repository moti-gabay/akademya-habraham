# Launch checklist

What stands between the current site (mock data on Vercel, no sign-in) and real learners.
**Done** means the repository history or docs show it. Everything else is **open** (not started) or **unverified** (built, not yet tried for real).
Who: **owner** (the project owner), **Claude Code**, or a **third party**. Changes to external services are the owner's step, or need the owner's go-ahead for that step.

> **Hard gate:** no real learner signs up before every item under "Blocking launch" **and** "Before enabling real services" is done. Two exceptions may follow shortly after launch: CSP enforcement and the HSTS raise.

## Blocking launch

| What | Why | Who | Status | Verified by |
|---|---|---|---|---|
| Privacy policy page `/privacy`, Hebrew then English | Learners must know what is kept, why, where, for how long, and how to ask for it. ARCHITECTURE §1.6 lists what it has to say (tombstone, audit rows, Clerk and Vercel data). | owner (text), Claude Code (page) | open | Page live in he and en; counsel has approved the text |
| Accessibility statement `/accessibility`, Hebrew then English | Israeli accessibility rules; the audience is older adults | owner (text), Claude Code (page) | open | Page live in he and en; counsel has approved it or confirmed an exemption |
| Notice at the sign-up form, linking both pages | Learners are informed before data is collected | Claude Code | open | e2e checks the notice and links on the sign-up screen |
| One hour with an Israeli privacy and accessibility counsel | Three open questions: is religious belief (conversion study) a special category; transfers to US processors (Clerk, Vercel, Neon); does the exemption for sites limited to registered users apply | owner, third party | open | Written answers on file. The legal research doc is outside this repository. |
| Who answers privacy requests, and within what time | README "Data subject requests" step 5 points to a time the privacy policy has not set yet | owner | open | Named in the privacy policy |
| Data export and erase | Access and deletion on request (ARCHITECTURE §1.6) | Claude Code (built), owner (run) | built: done (a3eb507). On the dev Neon branch: done, as reported by the owner; this file is the first written record | Erase tested on PGlite (`erase.test.ts`). Owner's dev-branch dry run verified: database errors on Neon do not leak the email (`safeErrors`): PASS; export and erase of a seed user; restore by re-seeding. **Not verified:** a real signed Clerk webhook delivery (next row) |
| A real, signed `user.deleted` from Clerk | Deletion in production depends on the webhook. Depends on the Clerk Preview row below. | owner | unverified | Clerk shows the attempt succeeded; `webhook_events` row has `processed_at` and no error (README "Data subject requests") |
| Turn off Clerk's self-service account deletion for the MVP | Deletion goes through the documented request process, so the owner can check it happened | owner | open | Clerk dashboard setting; the "Manage account" screen shows no delete action |
| DPAs with Clerk, Vercel, Neon, Bunny and Cloudflare; the Vercel function region | Learners' data is processed by these vendors, some outside Israel (a counsel question) | owner | open | Each vendor's DPA accepted and on file; function region to check in the console and named in the privacy policy |
| Secret scan of the full git history | The repository is public; a secret in any old commit is exposed | Claude Code (scan), owner (rotate) | open | A scanner run over every commit reports nothing, or every hit is rotated and recorded |
| Real content: first real lessons with subtitles, thumbnails and teachers | Most seeded lessons are placeholders (README "Known limits") | third party (client) | open | Lessons published in the admin with a ready video, captions, image and teacher; each opened on a phone |
| Usability test with 3 to 5 older learners on their own phones | The audience is older adults; emulated tests cannot show where they get stuck | owner | open | Notes per participant for sign-up, starting and resuming a lesson, text size; each blocker fixed or listed |

## Before enabling real services

| What | Why | Who | Status | Verified by |
|---|---|---|---|---|
| Clerk on a Vercel Preview with a dev Clerk instance and the dev Neon branch, before Production | Sign-up, sign-in and the webhook have only run without keys or locally | owner | unverified | README "Security headers" checklist: sign-in, sign-up with Turnstile, sign-out, avatars, no `Refused to` lines; webhook delivery succeeds |
| An admin with an authenticator app entering `/admin` | The refusal without a second factor is verified; the way in is not | owner | unverified | Signs in with TOTP and reaches `/admin` (README "Known limits") |
| Bunny: HLS playback and tus upload from the admin screen | Playback is built and tested on the fake provider only; the trial account ended | owner (needs a paid account) | unverified | README "Media" checklist: hls.js (desktop, Android), native HLS (iOS Safari), admin upload, webhook delivery |
| R2: presigned `PUT` and `/api/thumbnails` | CORS for the Preview and Production origins was never tried | owner | unverified (local origin done, October 2026) | Admin image upload works from a Preview and from Production |
| Migrations on the production Neon branch | Neon layout: the production branch is the default branch and is empty; dev is its child branch. All 5 migrations (`0000`–`0004`) are applied to dev (verified 2026-11-12 with psql: `\dt` shows the schema, `drizzle.__drizzle_migrations` has 5 rows) | owner only | open | `pnpm db:migrate` run by the owner on production; `drizzle.__drizzle_migrations` there has 5 rows |
| `NEXT_PUBLIC_CLERK_TELEMETRY_DISABLED=1` in every Clerk-mode environment | The CSP does not allow Clerk telemetry (`.env.example`) | owner | open | Set in Vercel Preview and Production env; no telemetry violations in the console |
| CSP from Report-Only to enforced | Only after all real services are verified, or it blocks them silently | owner, Claude Code | open | README "Security headers": `CSP_MODE=enforce` on Production, checks repeated once |
| Raise HSTS | One week until the production domain is final (ARCHITECTURE §1.6) | Claude Code | open | Header shows `max-age=63072000; includeSubDomains`; `preload` only with a submission |
| Clerk production setup: email templates, sender, languages | Verification emails use Clerk's templates and stay in English unless edited (README "Sign-in", step 7) | owner | open | A test sign-up on the production instance gets the email in Hebrew from the chosen sender; sender options to check in the console |
| Neon backup and restore | Learners' progress must survive a mistake | owner | open | The plan's restore window: to check in the console. Restore steps written down; one restore tried into a new branch |
| Error visibility | The error page shows only a Reference digest; it helps only if it can be found in the logs | owner, Claude Code | open | Steps to find a digest in Vercel's logs written down; Hobby log retention: to check in the console; one test error found by its digest; the matching log line has no email or name |
| Drizzle pinned, with an upgrade checklist | `safeErrors.ts` wraps an internal Drizzle method | Claude Code | done (6a6785c) | `safeErrors.test.ts` fails if the wrapper stops applying; checklist in ARCHITECTURE §1.3 "Error log" |
| Seed guard | The seed must never write to production | Claude Code | done (e0a9431) | Needs `DATA_SOURCE=db` on the command line; refuses `NODE_ENV=production`, `VERCEL`, and data the seed did not write; unit-tested |

## Soon after launch

| What | Why | Who | Status | Verified by |
|---|---|---|---|---|
| Staged launch: invitation only, about 10 learners | The first learners show problems before everyone meets them; the hard gate still applies | owner | open | Sign-up limited to invited addresses (Clerk setting, to check in the console); the number of learners known |
| Real-device tests: iPhone Safari (HLS, fullscreen), Android Chrome | iOS needs captions from the HLS manifest, which has not been tried (README "Known limits") | owner | open | Notes per device and lesson |
| Text-size and accessibility pass on real devices | Older adults; automated axe runs on emulated viewports only | owner | open | Largest text size usable on both phones; screen reader reads every control |
| ISR on Preview | Tag revalidation on a production build is not verified (the admin e2e runs in dev mode) | owner, Claude Code | unverified | Publish in admin, then the holiday page shows the lesson without a redeploy |
| Uptime monitoring on `/api/healthz` | Nothing alerts on downtime today | owner | open | Monitor set on the final domain; a test alert received |
| Production accounts and cards owned by the client: Bunny, Clerk, Neon, Vercel, R2 | The client must own their data and bills | owner, third party (client) | open | Each account is in the client's name, with the owner invited |
| Vercel plan | Hobby is non-commercial (ARCHITECTURE "Decisions"); Pro before the first paid subscriber | owner, client | open | Plan shown in Vercel |
| Clerk MFA pricing | The admin area needs a second factor; free-tier coverage in production is not verified | owner | unverified | Clerk's pricing or support answer on file |
| Domain | HSTS, webhooks, CORS and monitoring all need the final domain | owner, client | open | Domain points to Production with HTTPS |
| Launch runbook and rollback | A known way back: set Vercel to mock (`DATA_SOURCE` unset, no Clerk keys) and redeploy | owner, Claude Code | open | One page of steps; rollback tried once on a Preview |

## Later

| What | Why | Who | Status | Verified by |
|---|---|---|---|---|
| Product gaps from README "Known limits" | Rate limiting not in place; members-only lessons open to every signed-in user until billing; no simultaneous-device limit; one user name for all languages; most seeded lessons are placeholders; admin manages the catalog only (users, payments, statistics in Milestone 6) | Claude Code | open | Each closed by its own PR |
| Seed guard also checks teachers and tracks | The guard checks users and lessons only | Claude Code | open | Unit test with a non-seed teacher and track |
