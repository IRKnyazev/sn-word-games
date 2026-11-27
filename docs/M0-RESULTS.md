# M0 device results

Manta, Chauvet 3.31.45, plugin build 0.0.1 (versionCode 1007), sn-plugin-lib
0.2.3. Tested by the owner on 2026-11-27 (19:08–19:36 and a P6 re-test at
20:57–21:02). Logs and screenshots: the files uploaded to the `m0-probe`
branch.

## Install

- The CI artifact installs as downloaded (don't unzip it; the device unpacks
  it in Add Plugin).
- "Installation failed. The plugin version is too low" appeared once. Most
  likely cause: a build with the same `versionCode` was already installed.
  CI raises `versionCode` on every run, so a newer build always installs.
- No permission dialogs appeared: `hasPermission` answered 1 for FILE:READ,
  FILE:WRITE and INTERNET before any request.

## P1 Recognition (all strokes: ink pen, penType 16)

| What | Result | Time per call |
|---|---|---|
| Words on ruled lines (capitals and lower case) | **4/4 exact** | 0.8–1.0 s |
| One letter per box, 160 px boxes (A–Z) | 21/26 | 0.25–0.45 s |
| One letter per box, 112 px touching boxes (A–Z) | 18/26 | same |
| One letter per box, Wordle rows (30 letters) | 24/30 | same |
| Crossword entries read as one word ("help", "dog", "Cat", "hello", "STUFF") | all right | ~0.5 s |
| Rows of separate boxes read at once | letters come back space-separated; 4/11 rows exact | 0.6–1.3 s |

- Single-letter failures repeat by shape: **blank** for simple letters (I,
  L, O, U, J; a blank comes back fast, ~0.25 s) and **look-alikes** (O→"0",
  Z→"2", Y→"1", X→"/" or "✗", D→">", K→"v", V→"✓").
- The same letters are read correctly in context: the blank "l" and "o"
  cells of "hello" and "dog" were right when the entry was read as a word.
- A full 52-cell page one cell at a time took 20 s.
- Strokes outside any cell (margin notes) were correctly left out.

## P2 Coordinates

- `getElements` points are **page pixels** (1920×2560).
- `event_pen_up` points are **EMR** (maxX 21632, maxY 16224), even with
  0.2.3. The EMR→px conversion matched `getElements` to within 0.5 px.
- Lasso strokes arrive at pen-up with **penType 4**; ink pen is 16, fineliner
  10.
- `getLastElement()` returned a stroke other than the one just written.
- Motion events (finger and pen) are in page pixels.

## P3 Template

- Sharp and correctly placed; the floating toolbar covers only the top strip
  when docked there.
- Owner's choices: **3 px** grid lines, **18 px** clue numbers; the two
  greys (#9d, #c9) are easy to tell apart.
- Template names come back as `user_<file name>` (e.g.
  `user_p1-letters-8733f9fd31`), so pages can be identified by template.

## P4 Page buttons

- Finger and pen taps on TAP/READ work; drags don't fire.
- Taps on an ordinary note were ignored: `getCurrentFilePath()` reported the
  note on screen correctly (not the stale value other plugins saw).
- `canHandwrite()` is false while the plugin menu is open, true on the page.
- **Problem:** with the floating toolbar moved over TAP, tapping the
  toolbar's icons also fired TAP (`canHandwrite()` stayed true).
- `showRattaDialog` works; it stays up until the owner taps OK.

## P5 Network

- Wordle and Connections JSON: HTTP 200 in 0.1–1.4 s.

## P6 Feedback marks

- `insertGeometry` (result `true`) and geometry/picture elements through
  `insertPageElements` land exactly where placed. A picture element with a
  rect is the way to draw a grey tile.
- `insertImage` puts the image in the middle of the page at its own size,
  and it **disappears on the next page edit** (lasso delete or batch update).
- Plugin-inserted marks are **not** removed by the owner's Undo.
- Lasso removal (`lassoElements` → `getLassoElements` →
  `deleteLassoElements`) selects exactly our marks, **persists after the
  note is reopened**, and **can be undone** by the owner.
  `setLassoBoxState(2)` afterwards answers 904 (nothing to clear).
- `batchUpdatePageElements` deletes our marks and inserts its replacement in
  one call, **persists**, and **can't be undone**.
- `saveCurrentNote` works and **doesn't reset Undo** (the owner undid a
  scribble written before saving).
