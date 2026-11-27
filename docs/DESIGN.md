# Supernote Puzzles — design draft v0.2

Working name only. A Supernote plugin (Manta first) for playing the NYT games and
Minute Cryptic with the pen, so it feels as close to paper as possible.

Status: **draft for review**. v0.2 includes the plugin survey
(`docs/PLUGIN-SURVEY.md`). The remaining unknowns are answered by the M0 probe on
a real Manta.

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
| Show the puzzle | Make a PNG of the puzzle → `MyStyle/` (react-native-fs) → `createNote({template})` / `insertNotePage` | Ink2Task does this on Manta |
| Make the PNG | RN view → `react-native-view-shot` (InkGames), or a Kotlin Canvas module | InkGames |
| Read your writing | `getElements(page, path)` → stroke points (px) → square they fall in | Ink2Task; needs `FILE:READ` |
| Turn ink into text | `recognizeElements(strokes, pageSize)`; split on error 117 | dictionary, Ink2Task, Notipal |
| Page buttons | `registerMotionListener`: down and up inside the area, moved < 50 px, open file must be a puzzle note | Ink2Task |
| Toolbar buttons | `registerButton(1, ['NOTE'], …)`, `showType 0/1` | all |
| Feedback marks | `insertGeometry` (lines, polygons; penWidth ≥ 100), `insertImage` (shaded tiles) | Snap, Tables, InkGames |
| Remove our marks | lasso → `deleteLassoElements` (undoable) or `batchUpdatePageElements` | Scribble, Tables |
| Live strokes (later) | `event_pen_up` array; ink pens only `[1,10,11,15,16]` | Snap |
| Save state | `react-native-fs` JSON in the plugin dir; puzzle id also in the note filename | Ink2Task |
| Network | `plugin.permission.INTERNET` + `fetch` | Ink2Task, Task Hub |
| Floating clue bar (later) | Kotlin `TYPE_APPLICATION_OVERLAY` module | RPN, Ink2Task |

Requires firmware Chauvet **3.30.45 or later**.

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
- **`render/`**: layout → PNG (view-shot first; Kotlin Canvas if quality or
  speed needs it).
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
  and timing. **This decides the recognition design.**
- **P2 Stroke coordinates.** For the same stroke, are `getElements` points and
  `event_pen_up` points both in px on Manta 3.31, or is one of them EMR?
- **P3 Template quality.** Make a 15×15 grid template with small numbers:
  is it crisp, the right size, and the right place?
- **P4 Page-button taps.** Finger and pen taps on a printed button register;
  none fire on other notes.
- **P5 Network.** HTTPS `fetch` from PluginHost to nytimes.com (public Wordle
  JSON) works.
- **P6 Feedback.** Insert a ✓ mark and a grey tile image, then remove them
  through the lasso, and confirm undo still works.

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
- Install: "Add Plugin" with the new `.snplg` (don't use Reinstall, which uses
  the old copy); `versionCode` goes up every build.
- Each milestone ends with a device checklist and a log file sent back.

## 8. Not doing (for now)

- Syncing solves or streaks back to NYT accounts.
- Tiles, and any game that needs animation.
- Writing with the pen inside the plugin UI (it leaks into the note; the
  firmware-ink workaround is undocumented and fragile).
- Custom layers.
- Landscape and Nomad layouts (portrait Manta first; the layout code stays
  size-agnostic).
