# Decisions log

Newest first. Each entry: date, decision, why, what was rejected.
Device results from the owner's Manta beat docs and other plugins' notes.
"Pending Pn" means the M0 probe will confirm or overturn it.

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
