# Design concepts — Akademya Habraham

Five visual directions for the home page and the video viewing interface. Each has a browsable mockup in `design/concepts/` (open `design/concepts/index.html`). Every mockup renders both screens, defaults to Hebrew RTL, and has toggles for English LTR and a 390 px phone frame.

Shared rules that apply to every concept:

- **RTL-first.** All layout uses logical properties (`margin-inline-start`, `padding-inline-end`, `text-align: start`, `inset-inline`). Progress bars fill from the start edge. Horizontal scroll rows begin at the start edge. Directional icons (back, skip forward/back, chevrons) mirror in RTL; play, pause and the clock do not. Numbers and timecodes always render LTR (`unicode-bidi: isolate`).
- **Scripts.** Each concept names a Hebrew face and a Latin/Cyrillic companion. In production both load through `next/font` with `unicode-range`, so a single `font-family` stack serves he/en/ru/es.
- **Mobile first.** Every layout is designed at 390 px and then widened. Tap targets ≥ 44 px. The player is the first thing on the viewing screen on mobile.
- **Hebrew date** appears next to the Gregorian date wherever a date is shown.
- **Sample content** (same in all mockups): this week is Parashat Bereshit, 26 Tishrei 5787 / 7 Oct 2026. Teacher: Rav Avraham. Featured lesson: "In the beginning: what does 'in the image of God' mean?" (42:15). Brand Hebrew spelling (אקדמיה האברהם) still needs confirmation.
- **Not in scope of the mockups.** Admin dashboard, auth screens, checkout. They inherit the chosen concept's tokens.

---

## 1. Dark / Cinematic

**Direction.** A night-sky room with one warm light. Netflix's row structure, but the mood is candlelight rather than neon: deep blue-black surfaces, gold only where the eye should land. The hero is the week's lesson shown as a film poster.

**Palette**

| Token | Hex | Use |
|---|---|---|
| night | `#0B0F1A` | page background |
| slate | `#141A2B` | cards, player chrome |
| raised | `#1E2638` | hover, chips |
| ivory | `#F3EEE3` | primary text |
| mist | `#8A93A8` | secondary text, meta |
| gold | `#D9A441` | primary action, progress, active state |

Only one accent. No gradients except the hero image scrim (night → transparent).

**Typography.** Display: Secular One (Hebrew + Latin), companion Oswald for ru/es display. Body: Rubik 400/500. Scale: hero title 44/52 px mobile, 72 px desktop; row titles 20 px; card titles 15 px; meta 13 px. Hero title is the memorable element: oversized, tight leading, no decoration.

**Home layout**
```
┌─────────────────────────────────────┐
│ ☰  אקדמיה האברהם        חיפוש  ◯   │  slim translucent top bar
│                                     │
│   [full-bleed poster, scrim at end] │
│   השבוע · פרשת בראשית               │  small gold kicker
│   בראשית ברא: מה פירוש              │  Secular One, 2–3 lines
│   "בצלם אלוקים"?                    │
│   הרב אברהם · 42:15 · כ"ו תשרי      │
│   [▶ צפייה]  [+ שמירה]              │
├─────────────────────────────────────┤
│ המשך לצפות            ‹ scroll ›    │  row title + horizontal scroll
│ [16:9][16:9][16:9]…                 │  cards with gold progress strip
│ פרשת השבוע                          │
│ [16:9][16:9][16:9]…                 │
│ חגים / הלכה …                       │
└─────────────────────────────────────┘
```
Desktop: hero 70 vh, rows show 5 cards, arrows on hover. Mobile: hero 55 vh, rows scroll with 1.4 cards visible so the next card peeks.

**Cards.** 16:9 thumbnail, 6 px radius, no border, no shadow. Duration badge bottom-end in slate. Gold progress strip along the bottom edge. Title below the image (not overlaid), one line, mist meta line under it. Hover/focus: image brightens, title turns ivory → gold.

**Viewing screen.** Player edge-to-edge on mobile, 16:9 inside a 1200 px column on desktop. Chrome is slate; scrubber gold. Under the player: kicker (category · parsha), title in Secular One 28 px, teacher row with avatar, language chips for subtitles (he / en / ru / es), description, attachments. "Up next" row at the bottom using the same cards. Watermark: user email at 8 % opacity bottom-start of the video.

**RTL/LTR.** Scrim flips side with direction (`inset-inline-end`). Row arrows mirror. The poster crops from the end side so the title sits over the darkest area in both directions.

**Best for / trade-offs.** Strongest "destination" feel and the best fit for watching in the evening. Weakest at skimming large catalogs and for older users who prefer light interfaces. Dark UI and gold need careful contrast on cheap phone screens (ivory on night is 15:1, gold on night 9:1, fine).

---

## 2. Warm Classic / Heritage ("Digital Beit Midrash")

**Direction.** The feel of an open sefer on a wooden table: parchment paper, navy ink, a touch of burgundy and gold leaf. The hero is a two-page spread for this week's Parsha. Category sections are shelves.

**Palette**

| Token | Hex | Use |
|---|---|---|
| parchment | `#F3EAD7` | page background |
| page | `#FBF6EC` | cards, player surround |
| ink | `#1B2A4A` | text, primary buttons |
| burgundy | `#7A2E2E` | secondary action, active tab |
| leaf | `#B8912F` | rules, ornaments, progress |
| sand | `#6B5E4A` | meta, secondary text |

**Typography.** Frank Ruhl Libre (Hebrew + Latin serif) for display and body; Lora for ru/es. Scale: hero title 36 px mobile, 56 px desktop; section headings 24 px; card titles 17 px; body 17/28 px (serif gets more leading). Titles are set in Frank Ruhl Libre 700 with slightly tightened tracking. No all-caps anywhere.

**Home layout**
```
┌─────────────────────────────────────┐
│ אקדמיה האברהם   בית פרשה חגים הלכה  │  text nav, hairline leaf rule below
├──────────────────┬──────────────────┤
│ כ"ו בתשרי תשפ"ז │ [framed poster]  │  "open book" spread; on mobile the
│ השבוע            │  featured lesson │  two pages stack, date page first
│ פרשת בראשית      │  title, teacher  │
│ short intro text │  [צפייה בשיעור]  │
├──────────────────┴──────────────────┤
│ ═══ פרשת השבוע ═══                  │  shelf: double rule with leaf ornament
│ [4:5][4:5][4:5][4:5]                │  book-cover cards
│ ═══ חגים ═══                        │
│ ═══ הלכה ═══                        │
└─────────────────────────────────────┘
```
Desktop: spread is two equal columns with a 1 px leaf rule as the "gutter". Mobile: single column, date block becomes a compact strip above the poster.

**Cards.** Portrait 4:5 "book cover": thumbnail inside a 1 px ink frame with a 3 px inset double border in leaf. Title below in serif, teacher in sand. Progress is a thin leaf line under the frame. No shadow, no radius.

**Viewing screen.** Player sits inside the same double frame. Title in Frank Ruhl Libre 32 px, Hebrew date + Gregorian date below. Two-column on desktop: player + description on the start side, a "sources" panel (מראי מקומות) and chapters on the end side, styled like a commentary margin in smaller type. Subtitle languages as text links separated by leaf dots. Mobile: sources panel collapses into a tab under the description.

**RTL/LTR.** The spread reads date page first in both directions (start side). Ornaments are symmetric so they do not need mirroring. Serif Hebrew needs 1.6 line-height minimum; Latin companion gets 1.55.

**Best for / trade-offs.** Most emotionally right for a Torah community and most distinct from generic streaming apps. Risk of looking dated if ornamentation is overdone, so ornaments are limited to shelf rules and the hero frame. Portrait cards show fewer lessons per row.

---

## 3. Modern Minimalist

**Direction.** The catalog is the product. White space, one family in one weight range, black on white, a single cobalt accent. The hero is a search field large enough to be the headline, with filter chips directly under it.

**Palette**

| Token | Hex | Use |
|---|---|---|
| white | `#FFFFFF` | background |
| black | `#000000` | text, primary button |
| graphite | `#6E6E6E` | meta |
| hairline | `#E6E6E6` | dividers |
| cobalt | `#1F4FD8` | focus, active filter, progress, links |
| cobalt-tint | `#E8EDFB` | selected chip background |

**Typography.** IBM Plex Sans Hebrew + IBM Plex Sans (same design, covers all three scripts). One family. Scale: search field 24 px mobile, 32 px desktop; results title 18 px; list meta 14 px; viewing title 32/40 px. Weights 400 and 600 only.

**Home layout**
```
┌─────────────────────────────────────┐
│ אקדמיה האברהם            [כניסה]   │
│                                     │
│ מה תרצו ללמוד השבוע?                │  one-line question, 28 px
│ ┌─────────────────────────────┐     │
│ │ 🔍 חיפוש שיעור, פרשה או הלכה │     │  the hero: 64 px tall field
│ └─────────────────────────────┘     │
│ (נושא ▾)(רב ▾)(אורך ▾)(שפה ▾)       │  filter chips, hairline border
│ פרשת בראשית · השבוע   [רשימה|רשת]  │  context line + view toggle
├─────────────────────────────────────┤
│ [1:1] title                42:15    │  list rows separated by hairlines
│       הרב אברהם · פרשה              │
│ ─────────────────────────────────── │
│ [1:1] title                38:40    │
└─────────────────────────────────────┘
```
Desktop: 840 px centered column for search and list; grid view shows 3 columns of 16:9 cards with the same hairline treatment. Mobile: list view default.

**Cards / rows.** List rows: 72 px square thumbnail with 4 px radius, title + meta, duration right-aligned (end), 1 px hairline between rows, no borders around rows. Progress is a 2 px cobalt line under the thumbnail. Grid cards: 16:9 image, title, meta, hairline below, nothing else.

**Viewing screen.** Player full width of the column. Below: title 32 px, one meta line (teacher · category · duration · Hebrew date), tabs in black text with a 2 px cobalt underline for the active one: Description, Subtitles, Files. Related lessons as the same list rows. Subscribe prompt for non-subscribers is a plain black band with white text, no illustration.

**RTL/LTR.** Durations stay at the end edge in both directions. The search icon sits at the start edge. Tabs' underline animates from the start side.

**Best for / trade-offs.** Fastest to build, fastest to load, best for a catalog that will grow into hundreds of lessons, best accessibility baseline. Least atmosphere; relies entirely on typography and content quality. The community may find it cold.

---

## 4. Torah Academy (LMS)

**Direction.** A study program, not a video library. Lessons live inside series, series show progress, and the hero is "continue where you left off". Calm green signals learning, amber marks achievement.

**Palette**

| Token | Hex | Use |
|---|---|---|
| chalk | `#F7F8FA` | page background |
| white | `#FFFFFF` | cards, sidebar |
| text | `#1E2433` | primary text |
| muted | `#5C6478` | meta |
| moss | `#1E6B52` | primary action, progress, active nav |
| moss-tint | `#DDF0E7` | progress track, selected states |
| amber | `#E0A52A` | completion badges, streak |

**Typography.** Assistant (Hebrew + Latin) with Source Sans 3 for ru/es (same lineage). Scale: hero title 28/36 px; section headings 20 px; card titles 16 px; meta 13 px. Numbers in progress rings use tabular figures at 600.

**Home layout**
```
desktop                                     mobile
┌──────────┬────────────────────────────┐   ┌──────────────────────┐
│ ▣ בית    │ בוקר טוב, משה               │   │ בוקר טוב, משה         │
│ ▶ הסדרות│ ┌──────────────────────────┐ │   │ ┌──────────────────┐ │
│   שלי   │ │ (◔ 58%) המשך ללמוד       │ │   │ │(◔) המשך ללמוד    │ │
│ ✎ פרשה  │ │ הלכות שבת · שיעור 6/12    │ │   │ │ הלכות שבת 6/12   │ │
│ ✡ חגים  │ │ [המשך מ־12:40]           │ │   │ │ [המשך מ־12:40]   │ │
│ ☰ הלכה  │ └──────────────────────────┘ │   │ └──────────────────┘ │
│ ◔ התקדמות│ הסדרות שלי                  │   │ הסדרות שלי            │
│          │ [series][series][series]    │   │ [series][series]     │
│          │ השבוע · פרשת בראשית         │   │ השבוע · פרשת בראשית   │
│          │ [lesson][lesson][lesson]    │   │ [lesson][lesson]     │
└──────────┴────────────────────────────┘   │ ▣  ▶  ✎  ✡  ◔  (tab bar)│
                                             └──────────────────────┘
```
Sidebar 240 px on the start side on desktop; bottom tab bar on mobile. Content column max 1040 px.

**Cards.** Series card: white, 12 px radius, 1 px `#E3E6EC` border, no shadow. Thumbnail 16:9, title, "6 of 12 lessons" line, moss progress bar on a moss-tint track, amber check badge when complete. Lesson card: same shell with a smaller 16:9 image, watched percentage as a ring at the end of the title row. Completed lessons show a moss check instead of the ring.

**Viewing screen.** Desktop: player and description on the start side (two thirds), a panel on the end side with two tabs: Lessons in this series (with checks and the current lesson highlighted) and Notes (a plain textarea that saves per lesson). Chapter list under the player. "Mark as completed" button in moss. Mobile: panel becomes a sheet reachable from a sticky "Series 6/12" bar under the player.

**RTL/LTR.** Sidebar moves to the end side in LTR by logical positioning only. Progress rings fill clockwise in both directions (rotation is not mirrored). Checkmarks are not mirrored.

**Best for / trade-offs.** Best retention mechanics and the most natural home for Halacha series. The most UI to build and maintain. Can feel like homework; the tone of copy has to stay warm. Requires the admin to organize lessons into series from day one.

---

## 5. Mobile & Audio-First

**Direction.** A podcast app that also plays video. Built for commuting and for listening in the kitchen: one column, big thumbs, a video/audio switch that is the main control, and a mini-player that never leaves the bottom of the screen.

**Palette**

| Token | Hex | Use |
|---|---|---|
| paper | `#FBF7F2` | background |
| ink | `#22201E` | text |
| plum | `#5A2D82` | primary action, mini-player, active toggle |
| plum-tint | `#EDE6F5` | chips, toggle track |
| saffron | `#F2B134` | progress, "new" dot |
| stone | `#7A746D` | meta |

**Typography.** Rubik only (Hebrew, Latin, Cyrillic in one family), 400 for body, 600 for titles, 800 for the hero. Scale: hero title 30 px; list titles 16 px; meta 13 px; mini-player title 14 px. Large tap targets drive the scale more than reading comfort.

**Home layout (phone is the primary canvas; desktop is a 480 px centered column with a side panel for the queue)**
```
┌──────────────────────┐
│ אקדמיה האברהם    ◯   │
│ ┌──────────────────┐ │
│ │   1:1 artwork    │ │  continue listening / featured
│ │  (poster crop)   │ │
│ └──────────────────┘ │
│ בראשית ברא: מה פירוש │  Rubik 800
│ "בצלם אלוקים"?       │
│ הרב אברהם · 42:15    │
│ [ ▶ וידאו | ♪ אודיו ] │  THE control: segmented toggle, 56 px tall
│ ───────── saffron ──  │  progress
│ חדש השבוע            │
│ [art] title     38:40 ▶│  episode rows
│ [art] title     51:02 ▶│
│ [art] title     29:18 ✓│
│ ...                  │
├──────────────────────┤
│ [art] title    ▶ ⏭  │  sticky mini-player (plum), 64 px
└──────────────────────┘
```

**Cards / rows.** Episode rows: 56 px square art with 10 px radius, title, meta, a 40 px circular play button at the end edge; saffron dot for unplayed, check for finished. No borders; rows separated by 12 px spacing. Topic chips (Parsha, Holidays, Halacha) scroll horizontally under the hero.

**Viewing screen.** The toggle sits at the top of the screen. Video mode: 16:9 player, then title and controls. Audio mode: 1:1 artwork, a tall waveform-style scrubber in plum with saffron played portion, 15 s back / 30 s forward, speed (1×, 1.25×, 1.5×, 2×), sleep timer, subtitles off by default. Below either mode: description, chapters, "up next" rows. Mini-player persists when navigating back to home.

**RTL/LTR.** Skip buttons mirror (15 s back is on the start side in both directions). The segmented toggle's selected pill slides from the start. Mini-player play button sits at the end edge.

**Best for / trade-offs.** Best for daily use and for the lowest-bandwidth members; audio-only playback cuts delivery cost. Needs an audio-only HLS rendition from Bunny (available by default in the encoding ladder). Desktop experience is secondary and the catalog browsing is weaker than concepts 2 and 3.

---

## Comparison

| | Cinematic | Heritage | Minimalist | Academy | Audio-first |
|---|---|---|---|---|---|
| Community fit | ●●○ | ●●● | ●○○ | ●●○ | ●●○ |
| Catalog browsing | ●●○ | ●●○ | ●●● | ●●○ | ●○○ |
| Build effort | ●●○ | ●●○ | ●○○ | ●●● | ●●○ |
| Retention mechanics | ●○○ | ●○○ | ●○○ | ●●● | ●●○ |
| Mobile daily use | ●●○ | ●○○ | ●●○ | ●●○ | ●●● |
| Accessibility baseline | ●●○ | ●●○ | ●●● | ●●● | ●●○ |

Hybrids are reasonable: Heritage tokens with the Academy progress model, or Minimalist structure with the Audio-first mini-player. Pick the base concept first; hybrids are a follow-up decision.
