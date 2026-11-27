# Decisions log

Newest first. Each entry: date, decision, why, what was rejected.
Device results from the owner's Manta beat docs and other plugins' notes.
"Pending Pn" means the M0 probe will confirm or overturn it; M0 results
are recorded in the first entry below.

## 2026-11-27 — M0 device results (Manta, Chauvet 3.31.45)

Evidence for all entries below: `docs/M0-RESULTS.md`.

### Recognition: read whole entries, not single squares

- **Decision:** Recognise a whole entry (an across or down answer, a Wordle
  row) in one call and map its letters back to the squares in order when the
  count matches. Read single squares only as a fallback. Normalise
  look-alikes (0→O, 1→I, 2→Z, 5→S, ✗/×→X, ✓→V) before comparing, and when
  checking against a known answer, count a look-alike of the right letter as
  right. Always show what was read.
- **Why:** Words on lines were 4/4 and entries like "help", "dog", "hello"
  were read correctly, while the same letters alone failed 18–31% of the time
  (blank for I, L, O, U, J; digits and symbols for O, Z, Y, X, D, V). Reading
  per entry is also faster (one ~0.5 s call instead of one per square).
- **Rejected:** One call per square (75–82% and slow); our own A–Z
  classifier for now (try the cheaper fixes first; M1 can also test changing
  the pen type to fineliner before recognising).

### Coordinates: convert pen-up, trust getElements

- **Decision:** Treat `getElements` points as page pixels. Treat
  `event_pen_up` points as EMR and convert them (the formula in
  `src/ink/frame.ts`). Keep frame detection as a guard.
- **Why:** Measured with a printed target: `getElements` px, pen-up EMR, the
  conversion matched to 0.5 px. Lasso strokes are penType 4 at pen-up.
- **Rejected:** Assuming 0.2.3 made pen-up px; `getLastElement()` (returned
  a different stroke).

### Marks: geometry and placed pictures; no insertImage

- **Decision:** Draw ✓/✗ and lines with `insertGeometry` or geometry
  elements, and shaded tiles with picture elements that carry a rect, through
  `insertPageElements`. Don't use `insertImage`.
- **Why:** Geometry and placed pictures land exactly. `insertImage` puts the
  image in the middle of the page and it vanishes on the next page edit.
- **Rejected:** `insertImage`; zig-zag fills.

### Removing our marks: batch update, lasso as fallback

- **Decision:** Replace or remove our own marks with
  `batchUpdatePageElements` (delete our numbers, insert the new marks, in
  one call). Keep the lasso route as a fallback. Only ever target geometry
  and pictures we placed, inside a known area; never strokes. Don't call
  `setLassoBoxState(2)` after `deleteLassoElements` (904). Never
  `deletePageElements`.
- **Why:** Both routes persist after reopening the note. Plugin inserts
  aren't on the owner's Undo stack, and batch removals aren't either, so the
  owner's Undo stays about their own ink and doesn't resurrect stale marks;
  lasso removals are undoable, which would bring old ✓/✗ back. The batch
  call is also one atomic step.
- **Rejected:** Lasso as the main route (undo brings marks back, and the
  lasso can clash with the owner's own selection).
- **Supersedes:** "Removing our own marks is unresolved".

### Saving

- **Decision:** Still don't save during play, but saving is no longer
  feared: on 3.31.45 `saveCurrentNote` doesn't reset Undo.
- **Why:** The owner undid a scribble written before a save.
- **Supersedes:** "Don't save the note during normal play" (its reason was
  Snap's measurement on older firmware).

### Page buttons need a guard against the floating toolbar

- **Decision:** Keep page buttons and the `getCurrentFilePath()` +
  `canHandwrite()` guard (both behaved correctly), but M1 must stop a tap on
  the floating toolbar firing a printed button underneath it.
- **Why:** With the toolbar moved over TAP, tapping its icons fired TAP;
  `canHandwrite()` stayed true.
- **Options for M1:** put buttons where the docked toolbar can't sit, require
  a short hold, or ignore a tap that lands while the toolbar is over the
  button (if detectable).

### Template style

- **Decision:** Grid lines 3 px, clue numbers 18 px; greys #9d and #c9.
- **Why:** The owner's choice from the P3 sample strip.

### Install

- **Decision:** Install the CI artifact as downloaded (no unzipping) with Add
  Plugin. Every CI build has a higher `versionCode`.
- **Why:** The device unpacks the artifact. "The plugin version is too low"
  means the installed build's `versionCode` isn't lower.

## 2026-11-27 — Log file only after FILE:WRITE; pages identified by template

- **Decision:** The log file in `Document/` is attached only after FILE:WRITE
  is granted (checked silently at start-up, asked for on the first menu
  action); until then lines wait in memory and the menu's **Show log** works.
  Probe pages are identified by their template name (`<page id>-<sha>.png`),
  falling back to the page index.
- **Why:** `Document/` is a permission-gated folder (M0 review). The order of
  pages added with `insertNotePage` isn't documented, so the page index alone
  could pick the wrong layout.
- **Rejected:** Writing the log at start-up; trusting the page index.

## 2026-11-27 — No answers in logs

- **Decision:** Logs and probe output never contain puzzle answers (Wordle
  solution, crossword fills, Connections groups). They log status, sizes,
  field names and lengths only.
- **Why:** The owner plays these puzzles daily and sends logs back.
- **Rejected:** Logging the raw JSON for debugging.

## 2026-11-27 — versionCode from the CI run number

- **Decision:** CI sets `versionCode` to `1000 + GITHUB_RUN_NUMBER` and
  `versionName` from `package.json`. Tags must be `v<package.json version>`.
- **Why:** The device only upgrades when `versionCode` rises; doing it by hand
  is easy to forget.
- **Rejected:** Manual bumps (Snap); `MAJOR*10000+MINOR*100+PATCH`
  (sn-dictionary), which doesn't change between builds of the same version.

## 2026-11-27 — Don't save the note during normal play (pending P6)

- **Decision:** Reading strokes and inserting marks never calls
  `saveCurrentNote`.
- **Why:** Snap measured on a Manta that saving resets undo. Ink2Task and
  Scribble see unsaved ink through `getElements` without saving.
- **Rejected:** Tables' save-before-every-read pattern.

## 2026-11-27 — Removing our own marks is unresolved (pending P6)

- **Decision:** Never call `deletePageElements`. M0 measures two removal
  routes on the Manta: lasso (`lassoElements` → `getLassoElements` →
  `deleteLassoElements` → `setLassoBoxState(2)`) and
  `batchUpdatePageElements` (delete + insert). The choice waits for P6.
- **Why:** `deletePageElements` unbinds the plugin (Tables) and clears undo
  (Snap). Scribble saw lasso deletes not persist on a Manta; Tables saw error
  904. `batchUpdatePageElements` can't do a pure delete (empty insert → 106).
- **Rejected:** `PluginFileAPI.deleteElements` (file-level, not undoable,
  needs a reload).

## 2026-11-27 — "Is this a puzzle note?" guard (pending P4)

- **Decision:** A page-button tap only acts when `getCurrentFilePath()` is a
  puzzle note **and** `canHandwrite()` isn't `false`.
- **Why:** Ink2Task found `getCurrentFilePath()` returns the last note the
  plugin touched, not necessarily the one on screen, and that taps on the
  top menu overlay pass through to the page (`canHandwrite()` is `false`
  for those on a Manta).
- **Rejected:** Path check alone (design v0.2).

## 2026-11-27 — Plugin identity

- **Decision:** `pluginKey` and `app.json` name `SupernotePuzzles`; display
  name "Puzzles"; a fixed `pluginID` committed in `PluginConfig.json`. The
  probes stay in the product as the Probes screen.
- **Why:** The key can't change later without becoming a different plugin,
  and the `.snplg` file name must equal it. The template's build script makes
  a new random `pluginID` on every clean build unless the config is committed.
- **Rejected:** A separate throwaway probe plugin.

## 2026-11-27 — M0 templates are rendered at development time

- **Decision:** `src/layout/` (pure TS) defines every rectangle; `src/render/`
  turns a layout into SVG; `scripts/render-templates.ts` rasterises the SVG
  with resvg (Libre Franklin, OFL) into 1920×2560 8-bit RGB PNGs (the format
  Ink2Task uses on a Manta) and embeds them as base64 in
  `src/assets/templates.generated.ts`. On the device they are written to
  `MyStyle/SupernotePuzzles/` with react-native-fs and used by `createNote`.
- **Why:** Every M0 page is static, and the same layout module drives the
  renderer, the stroke-to-box mapping and the tap zones. It needs no native
  rendering dependency.
- **Rejected for now:** `react-native-view-shot` (InkGames; no 1:1 pixel
  control, another native module) and a Kotlin Canvas module. How to render
  live puzzles on the device is decided in M1/M2.

## 2026-11-27 — react-native-fs for files

- **Decision:** Use `react-native-fs` 2.20.0 to write template PNGs, the log
  file and (later) state JSON.
- **Why:** The SDK has no text-file write. Ink2Task uses exactly this version
  on a Manta for templates. The PluginHost doesn't provide it, so the build
  compiles native code (`app.npk`, `reactPackages`), and CI checks that.
- **Rejected:** Our own Kotlin file module (Tables' approach) for now.

## 2026-11-27 — SDK 0.2.3 and page-pixel coordinates (pending P2)

- **Decision:** Pin `sn-plugin-lib` ^0.2.3 and treat stroke, geometry and
  picture coordinates as page pixels (Manta page 1920×2560). `src/ink/` keeps
  an EMR detector and converter as a fallback.
- **Why:** 0.2.x switched coordinates to page pixels (SDK source,
  `Element.ts`). Every reference plugin is on 0.1.65, where stroke points are
  EMR, which explains the EMR findings in the survey. Scribble still saw EMR
  pen-up points with 0.2.3 on the A5X firmware line.
- **Rejected:** The template's `^0.1.19` pin.

## 2026-11-27 — Target device and firmware

- **Decision:** Build and test against a Supernote **Manta** running
  **Chauvet 3.31.45**, using `sn-plugin-lib` ^0.2.3.
- **Why:** That is the owner's device and current firmware. The plugin system
  needs 3.30.45 or later. The SDK has no firmware-version call, so logs carry
  the version as user-reported.
- **Rejected:** Supporting the A5X/A6X line or Nomad for now. The layout code
  stays size-agnostic so they can be added later.

## 2026-11-27 — Repository

- **Decision:** The project lives in `IRKnyazev/sn-word-games`. The design
  docs from the planning chat (`DESIGN.md` v0.2, `PLUGIN-SURVEY.md`) are
  committed unchanged as the starting point.
- **Why:** It's a dedicated repo, so CI and releases stay clean.
- **Rejected:** Building inside an unrelated existing repo.
