# Supernote Puzzles — design v0.3

A Supernote plugin (Manta first) for playing the NYT games and Minute Cryptic
with the pen, so it feels as close to paper as possible. Plugin key
`SupernotePuzzles`, shown on the device as "Puzzles".

Status: **approved for M0**. v0.3 folds in the check of the survey's claims
against the `sn-plugin-lib` 0.2.3 source and the reference plugins' code
(`docs/SDK-NOTES.md`). Decisions are logged in `docs/DECISIONS.md`. The
remaining unknowns are answered by the M0 probe on a real Manta.

### Changes since v0.2

- **Coordinates:** SDK 0.2.x returns stroke, geometry and picture
  coordinates in **page pixels** (Manta 1920×2560). The EMR results in the
  survey come from plugins on 0.1.65. P2 still checks pen-up points.
- **Puzzle-note guard:** `getCurrentFilePath()` can return the last note the
  plugin touched rather than the one on screen, so page buttons also check
  `canHandwrite()` (Ink2Task).
- **Removing marks is unresolved:** lasso deletes didn't persist on a Manta
  for Scribble, and `batchUpdatePageElements` can't delete without inserting.
  P6 measures both routes.
- **Saving resets undo** (Snap), so play never calls `saveCurrentNote`.
- **Shaded tiles:** `insertImage(path)` has no position argument. A placed
  image needs a picture element (type 200) through `insertPageElements`,
  which the SDK calls "currently unused". P6 tries both.
- **M0 templates are rendered at development time** (layout → SVG → PNG,
  embedded as base64). On-device rendering is decided in M1/M2.
- **react-native-fs** writes files, so the plugin ships native code
  (`app.npk`). CI fails the build if it's missing.

### Changes since v0.1

- The puzzle is the note's **page template** (a PNG background), not elements
  we draw. Ink2Task shows this works, and the grid can't be erased or lassoed.
- Checking **scans the page when asked** (read strokes → find their square →
  recognise), the way Ink2Task does. Live pen-up tracking is optional, which
  removes the riskiest dependency from the first versions.
- Controls are **buttons printed on the page** (CHECK, REVEAL, ENTER) and
  tapped with a finger, as Ink2Task does. There are still toolbar buttons as a
  fallback.
- No custom layers; feedback goes on the main layer, and deletes go only
  through methods measured to be safe.
- A floating clue window is a possible later addition (as in the RPN plugin).

---

## 1. Principles

1. **The pen writes on a real note page.** All writing uses NOTE's own ink, with
   no extra lag. The plugin never draws your ink itself.
2. **The finger handles menus.** Picking a puzzle, settings and hints use taps,
   ideally on buttons printed on the page.
3. **Read on demand, not after every letter.** Like paper, nothing is checked
   until you ask. Auto-checking is an option, off by default.
4. **Always show what the plugin read.** When it checks, it shows its reading of
   each square, so a misread is obvious and easy to fix.
5. **Each puzzle is a normal note.** Finished puzzles stay as an ordinary
   notebook archive, readable even if the plugin is uninstalled.
6. **Never destroy your ink by accident.** The plugin never deletes handwriting,
   and only removes its own feedback marks, using undoable methods.

## 2. What the SDK provides (source and device-measured)

| Need | Approach | Evidence |
|---|---|---|
| Show the puzzle | Make a PNG of the puzzle → `MyStyle/SupernotePuzzles/` (react-native-fs) → `createNote({notePath, template, mode: 0, isPortrait: true})` with absolute paths / `insertNotePage({notePath, page, template})` | Ink2Task does this on Manta; SDK source |
| Make the PNG | M0: at development time (resvg). Live puzzles: decided in M1/M2 (view-shot or Kotlin Canvas) | DECISIONS.md |
| Read your writing | `getElements(page, path)` → strokes (`type 0`, `layerNum 0`) → points in page px (SDK 0.2.x) → square they fall in | SDK source; Ink2Task; needs `FILE:READ` (1503) |
| Turn ink into text | `recognizeElements(strokes, getPageSize(path, page))`; split on error 117; 116 = first use needs Wi-Fi | SDK source, Ink2Task, dictionary |
| Page buttons | `PluginManager.registerMotionListener(1, {onMsg})`: `action` 0 down / 1 up, `toolType` 1 finger / 2 pen; down and up inside the area, moved ≤ 50 px; open file is a puzzle note **and** `canHandwrite()` isn't `false` | Ink2Task (pending P4) |
| Toolbar buttons | `registerButton(1, ['NOTE'], {id, name, icon, showType: 1})` | all |
| Feedback marks | `insertGeometry` (`straightLine`, `GEO_polygon`, `GEO_circle`; penWidth ≥ 100; penType 10); shaded tiles via a picture element with a rect, or `insertImage(path)` (no position) | Snap, Tables (pending P6) |
| Remove our marks | Never `deletePageElements`. Lasso route or `batchUpdatePageElements`; which one works on a Manta is pending P6 | Scribble, Tables |
| Live strokes (later) | `registerEventListener('event_pen_up', 1, …)` → `Element[]`; filter to ink pens | Snap (pending P2) |
| Save state | `react-native-fs` JSON in the plugin dir; puzzle id also in the note filename. Never `saveCurrentNote` during play (resets undo) | Ink2Task, Snap |
| Network | `plugin.permission.INTERNET` declared **and** requested at runtime, then `fetch` (HTTPS only) | Ink2Task, gorlix (pending P5) |
| Floating clue bar (later) | Kotlin `TYPE_APPLICATION_OVERLAY` module; don't declare `SYSTEM_ALERT_WINDOW` | RPN, Ink2Task |

Requires firmware Chauvet **3.30.45 or later**; developed on 3.31.45.

## 3. Architecture: the puzzle is the page

```
 Plugin UI (finger, full-screen)                 Puzzle note  "Puzzles/2026-11-26 Mini.note"
 ┌───────────────────────────┐                   ┌──────────────────────────────────┐
 │ Today: Mini · Wordle · …  │── Start ──►       │ template PNG: grid, numbers,     │
 │ Archive · Settings        │  render PNG,      │ clues, [CHECK] [REVEAL] buttons  │
 └───────────────────────────┘  createNote       │                                  │
                                                 │   you write letters with pen     │
                                                 └───────────────┬──────────────────┘
                                                                 │ finger taps [CHECK]
                                   motion listener ◄─────────────┘
                                         │ (open file is a puzzle note?)
                                         ▼
       getElements → strokes on layer 0 → assign to squares (layout.ts) → per square/word
       recognizeElements → game rules → feedback marks (✓, ✗, shaded tiles, score)
```

### Modules (everything except `sdk/` and `native/` is pure TS and unit-tested)

- **`fetch/`**: one adapter per source. NYT is isolated so a redesign breaks one file.
- **`model/`**: normalised puzzle types (`GridPuzzle`, `WordlePuzzle`,
  `BeePuzzle`, `PathPuzzle`, `GroupPuzzle`).
- **`layout/`**: puzzle + page size → rectangles for squares, clues and
  buttons. **The one place where geometry is defined.** The renderer, the ink
  mapper and the tap areas all use it.
- **`render/`**: layout → SVG (pure TS). M0 rasterises it at development time
  (`scripts/render-templates.ts`); on-device rendering is decided in M1/M2.
- **`ink/`**: strokes → squares. Uses the stroke's centre and how much of it
  overlaps each square; ignores margin doodles; flags strokes that span two
  squares.
- **`recognise/`**: wraps `recognizeElements`; A–Z only; ignores case; splits on
  117; optional fallback classifier.
- **`games/`**: rules per game (check, hint, reveal, win).
- **`feedback/`**: places marks and keeps track of what it added so it can
  remove them.
- **`state/`**: JSON per note (puzzle id, squares revealed or checked, times).
- **`sdk/`**: thin wrappers with retry and timeout (insert, count, retry;
  `withTimeout`; no reliance on `setTimeout` during gameplay).
- **`diag/`**: log file (`Document/SupernotePuzzles/log.txt`) and a Probes
  screen.

## 4. How each game would play

| Game | Template shows | You do | CHECK does | Phase |
|---|---|---|---|---|
| Mini / Midi | Grid, clues | Write letters | Reads squares; ✓/✗ per word; REVEAL square/word/all | M1–M2 |
| Wordle | 6 rows × 5 boxes, an ENTER button per row | Write a guess, tap ENTER | Reads the row, checks it's a word, shades tiles with images | M3 |
| Crossword | Grid page + clues page | Same as Mini | Same | M4 |
| Minute Cryptic | Clue + letter boxes + HINT | Write the answer | Check; hints one step at a time | data source to be decided |
| Spelling Bee | Hive + ruled lines | One word per line | Reads lines, scores, rank | M5 |
| Strands / Letter Boxed | Letter grid / square | Draw lines through letters | Maps the path → letters | M5 (needs stroke paths, not OCR) |
| Connections | 4×4 words | Circle or tick 4 words, tap SUBMIT | Maps marks → words | M5 (or the plugin UI) |

## 5. Unknowns for the M0 probe

Answered by the survey: custom template ✓ (Ink2Task) · page-button taps ✓ ·
layers ✗ (avoid) · batch insert on Manta ✓ (with retry) · `userData` ✗.

Still open, all checked by the M0 probe on your Manta (Chauvet 3.31.45):

- **P1 Recognition quality.** Write test pages (single capitals in boxes, rows
  of 5 letters, words on lines). The probe recognises them (a) one square at a
  time, (b) one word at a time and (c) a whole row at once, then logs the text
  and timing. **This decides the recognition design.** Also: does
  `getElements` see ink that hasn't been saved?
- **P2 Stroke coordinates.** For the same stroke, are `getElements` points and
  `event_pen_up` points both in px on Manta 3.31, or is one of them EMR? A
  printed target box gives the true position. Also: pen types of ink and
  lasso strokes.
- **P3 Template quality.** Make a 15×15 grid template with small numbers:
  is it crisp, the right size, and the right place?
- **P4 Page-button taps.** Finger and pen taps on a printed button register;
  none fire on other notes; what `getCurrentFilePath()` and `canHandwrite()`
  return in each case.
- **P5 Network.** HTTPS `fetch` from PluginHost to nytimes.com (public Wordle
  JSON) works after the INTERNET permission is requested.
- **P6 Feedback.** Insert a ✓ mark and grey tiles (`insertImage` and a placed
  picture element), then remove them through the lasso and through
  `batchUpdatePageElements`; confirm the removal survives closing and
  reopening the note, and whether undo still works, including after a save.

## 6. Milestones

- **M0 — Probe plugin.** A test plugin that runs P1–P6 and writes a log file you
  send back. Throwaway code, but it sets up the repo, CI and wrappers.
- **M1 — Offline Mini.** A bundled sample Mini as a template note; write; CHECK and REVEAL.
- **M2 — Live Mini.** NYT fetch (NYT-S cookie entered once, stored privately).
- **M3 — Wordle.**
- **M4 — Full crossword**, clues on a separate page; maybe the floating clue bar.
- **M5 — Spelling Bee, Strands, Letter Boxed, Connections.**
- **Minute Cryptic:** data source to be decided: (a) ask the makers, (b) type the
  clue in yourself, (c) read the public daily page.

## 7. Build and workflow

- GitHub repo; Claude writes the code and runs lint and Jest in its workspace.
- **GitHub Actions** (based on Snap and sn-dictionary): lint → test → build
  `.snplg` on every push (download from the run), and a release on each `v*` tag.
- The build compiles native code (react-native-fs → `app.npk`). CI checks the
  package really contains it, because `buildPlugin.sh` exits 0 when Gradle
  fails.
- Install: "Add Plugin" with the new `.snplg` (don't use Reinstall, which uses
  the old copy); `versionCode` is `1000 + CI run number`, so it goes up every
  build. The file must stay named `SupernotePuzzles.snplg`.
- Each milestone ends with a device checklist and a log file sent back.

## 8. Not doing (for now)

- Syncing solves or streaks back to NYT accounts.
- Tiles, and any game that needs animation.
- Writing with the pen inside the plugin UI (it leaks into the note; the
  firmware-ink workaround is undocumented and fragile).
- Custom layers.
- Landscape and Nomad layouts (portrait Manta first; the layout code stays
  size-agnostic).
