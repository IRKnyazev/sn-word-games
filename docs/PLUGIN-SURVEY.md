# Survey of existing Supernote plugins

26 Nov 2026. A GitHub code search for `sn-plugin-lib` found about 100 plugin
repos. I cloned 24 and read the code of the 15 most relevant to our design.
"Measured" means the author recorded it on a real device. Several of these
measurements contradict the official docs, and where they do, I'd trust the
measurement.

## Plugins analysed

| # | Plugin | What it does | Why it matters to us |
|---|---|---|---|
| 1 | [j-raghavan/sn-dictionary](https://github.com/j-raghavan/sn-dictionary) | Lasso a word → offline WordNet definition | `recognizeElements` on lasso, SQLite word DB, 1,100+ Jest tests with the SDK injected as interfaces, lint/test/build CI |
| 2 | [CharlesCheval/supernote-snap](https://github.com/CharlesCheval/supernote-snap) | Hand-drawn shape + pause → perfect shape | **The best reference for `event_pen_up`**: message format, lasso strokes, pen types, timers, undo, tag → release CI |
| 3 | [LVEVAN/ink2task](https://github.com/LVEVAN/ink2task) | Handwritten checklist ↔ Reminders/Todoist | **Closest to our design**: custom PNG template → `createNote`, reads strokes inside boxes, OCR per box, **on-page tap button**, floating progress bubble |
| 4 | [Sparkinman/tables-supernote-plugin](https://github.com/Sparkinman/tables-supernote-plugin) | Ruled tables drawn as geometry | A long table of measured SDK facts (deletes, batches, layers, pen widths); built-in probe suite with a log file |
| 5 | [Sparkinman/patterns-supernote-plugin](https://github.com/Sparkinman/patterns-supernote-plugin) | Fill a box with dots/lines on its own layer | Same author as Tables; confirms the layer problems |
| 6 | [vincentaravantinos/scribble](https://github.com/vincentaravantinos/scribble) | Zig-zag over ink to erase it | **Pen-up points may be EMR while `getElements` is px**; permission behaviour; undoable delete via the lasso |
| 7 | [gi-os/supernote-gestures](https://github.com/gi-os/supernote-gestures) (SnToggle) | Finger/multi-finger gestures, scribble erase | Motion listener sees finger and pen; palm guards; Accessibility-service companion app |
| 8 | [j-raghavan/sn-canvas](https://github.com/j-raghavan/sn-canvas) | Infinite canvas in the plugin view | **Gets firmware-speed ink inside the plugin view** through an undocumented binder (`FirmwareInk.kt`); `createNote`/`insertImage` |
| 9 | [connorslade/supernote-rpn](https://github.com/connorslade/supernote-rpn) | Floating RPN calculator | **Floating native window over a note while you keep writing** |
| 10 | [wolfsolver/Supernote-InkGames](https://github.com/wolfsolver/Supernote-InkGames) | Puzzle generator (Sudoku, word find…) | Renders the puzzle as an RN view → `react-native-view-shot` PNG → `insertImage`. "Paper only", no checking |
| 11 | [AgP42/SuperFun](https://github.com/AgP42/SuperFun) | 19 games in the plugin view | Finger-only gameplay; Kotlin file-store module; firmware-matched builds |
| 12 | [AgP42/SuperTemplate](https://github.com/AgP42/SuperTemplate) | Double-tap template → heading via OCR | Finger double-tap on the page through the motion listener; OCR of handwriting |
| 13 | [Laumss/sn-plugins](https://github.com/Laumss/sn-plugins) (Notipal etc.) | Lasso → text/notes extraction | Recognisable pen types (1 and 10; others are remapped to 10); INTERNET |
| 14 | [Sparkinman/task-hub-supernote-plugin](https://github.com/Sparkinman/task-hub-supernote-plugin) | CalDAV tasks and calendar | Network sync, `createNote`, OCR of a lasso |
| 15 | [wolfsolver/Supernote-SmartPenToolkit](https://github.com/wolfsolver/Supernote-SmartPenToolkit) | Scribble-to-erase (alpha) | Another `event_pen_up` consumer; shows how destructive edits go wrong |

Also read: [gorlix/supernote-plugin-dev](https://github.com/gorlix/supernote-plugin-dev)
(a shared skill with 40+ device-verified gotchas) and
[apclark31/supernote-plugin-research](https://github.com/apclark31/supernote-plugin-research)
(SDK source extraction and reference notes).

## Findings, grouped by what we need

### A. A puzzle page made from a template works (Ink2Task, InkGames)

- **A custom PNG can be a note's page template.** Ink2Task embeds Manta and
  A5X template PNGs as base64, writes them to `MyStyle/` with
  `react-native-fs`, then calls `createNote({notePath, template, mode: 0,
  isPortrait: true})`.
- **A template is not an element.** "A blank page reports no elements"
  (Tables). So the grid can't be erased, lassoed or moved by accident, and
  any element the plugin reads back is always the user's own ink.
- The background is fixed when the note is created ("no API to change a note's
  background afterwards"), so each puzzle needs its own note or page.
- `createNote` only works while a note is open in the editor. From the plugin's
  Settings screen it fails with error 102.
- Another way to draw: render an RN view to PNG with `react-native-view-shot`,
  then `insertImage` (InkGames). That makes an element, which can be lassoed.

### B. Reading what you wrote

- **No live tracking needed for checking.** Ink2Task reads the page only when
  asked: `getElements(page, path)` → keep strokes on layer 0 → compute each
  stroke's bounding box and centre → keep those whose centre falls in the box →
  `recognizeElements`. It deliberately doesn't save first, and still sees
  freshly written strokes.
- `event_pen_up` (Snap, Scribble, SnToggle):
  - The message is an **array of Elements**, and the stroke's `numInPage` is 0
    until the host commits it.
  - **Lasso paths also arrive as pen-up strokes, with `penType` 4.** Accept
    only ink pens: `[1, 10, 11, 15, 16]` (16 = ink pen, undocumented).
  - **Coordinate trap:** on 2.27.42 (the A5X firmware line) with SDK 0.2.3,
    pen-up points were **EMR**, while `getElements` returned **px** (Scribble,
    reported to Ratta). Snap handles both. This needs checking on a Manta.
  - Don't change the page while the pen is down. The host drops the stroke
    being written (Snap).
- `getLastElement()` returns the last element of the *displayed* page, which
  isn't always the stroke you just wrote (geometry can come after it).

### C. Handwriting recognition

- `recognizeElements(elements, size)` needs the **page** size. A lasso rect
  throws `IllegalArgumentException getRealMaxX` (gotcha 25).
- Error **117** ("Recognition failed") is deterministic for some groups of
  strokes. Splitting the group in half recovers the text (Ink2Task).
- Only some pen types are recognised. Laumss remaps other pens to fineliner (10)
  before recognising.
- One call to the firmware takes about 0.3–1 s (dictionary).
- **Nobody has measured recognition of a single letter in a box.** That's still
  our main risk.

### D. Drawing on the page (geometry, images, deletes, layers)

- `penWidth` has a minimum of **100**. 100 is a hairline, 300 a heavier rule.
- **Geometry can't be filled.** Snap zig-zags inside the shape to fake a solid
  fill. For shaded Wordle tiles, `insertImage` of small grey PNGs will look
  better.
- **The first batch insert after the plugin panel opens is often dropped
  silently**: it reports success and draws nothing. Always count what landed
  and retry (Tables).
- **Avoid `deletePageElements`.** It unbinds the plugin from the note app
  (Tables) and clears undo (Snap). Deletes that work: `batchUpdatePageElements`
  (insert and delete together), or lasso → `deleteLassoElements`, which is
  undoable (Scribble).
- Elements must come from `createElement`. Hand-built objects fail with 106.
- **Layers are a trap.** Page operations only act on one layer, an explicit
  layer is refused (813), and `modifyLayers` changes the file but not the open
  app. Ink2Task gave up and draws everything on the main layer. Our design should
  not depend on layers.
- `Element.userData` is **thrown away by the firmware**, so nothing can be
  stored on an element.

### E. Buttons and UI

- **Buttons can be part of the page.** Ink2Task's template has a SYNC button
  printed on it; a global `registerMotionListener` notices a tap (down and up
  inside the area, moved less than 50 px) from finger or pen. Pitfalls: the
  listener fires on *any* open note, so check that `getCurrentFilePath()` is a
  puzzle note; and taps on a menu shown over the button still get through.
- **The plugin view is always full screen.** `showPluginView()` takes no
  arguments, and the `regionType` field isn't exposed to plugins.
- **Floating native windows** (`TYPE_APPLICATION_OVERLAY` from a Kotlin module)
  can stay on screen while you keep writing in the note (RPN calculator,
  Ink2Task bubble). This could hold a crossword's current clue or a timer.
- **The pen in the plugin view writes into the note underneath** unless pen
  input is turned off for that area (gotcha 31). There's an undocumented binder
  that gives firmware-speed ink inside a plugin view (Canvas's
  `FirmwareInk.kt`), but it's fragile. We keep the pen on real note pages.
- Timers can stop running once the plugin view has been shown (Snap), so don't
  rely on `setTimeout` for core logic.

### F. Storage, permissions, network

- The SDK has **no API to write a text file**. Use `react-native-fs`
  (Ink2Task, InkGames), SQLite (dictionary) or a small Kotlin module (SuperFun).
  Snap even stored its settings as folder names.
- `getElements`/`getPageSize` need `FILE:READ` even for the open note (error
  1503). `getPageDisplaySize` doesn't. Ask for permission when it's first needed.
- Firmware updates have added permission checks to calls that used to work;
  check `adb logcat` for `PluginSec.*DENY`.
- INTERNET: Ink2Task, Task Hub and Notipal use the network. Native code runs
  inside `com.ratta.supernote.pluginhost`, so it gets *that* app's Android
  permissions.

### G. Build, release, debugging

- CI: Snap builds `.snplg` on `ubuntu-latest` when a tag is pushed and attaches
  it to a release. The dictionary runs lint, then Jest, then build. Both are good
  templates.
- Keep everything that doesn't use the SDK as pure TypeScript with the SDK
  passed in through interfaces (dictionary's `CommAPILike`, Tables' `src/table/`).
  `sn-plugin-lib` can't load off the device.
- The build bundles with `--dev false`, so `__DEV__` logs disappear. Keep one
  startup log that always prints, and write a log file the user can send
  (Tables: `Document/Tables/log.txt`, with a **Probes** button).
- Reinstalling a plugin from Settings uses the host's stored copy in
  `MyStyle/Plugins/`, not your new file. Use "Add Plugin", or overwrite the
  stored copy. Increase `versionCode` every build.
- `PluginConfig.json` `reactPackages` decides which native modules load; the
  normal `getPackages()` list doesn't.
