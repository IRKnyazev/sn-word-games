# SDK notes (verified)

Facts we code against, checked on 2026-11-27 against the `sn-plugin-lib`
**0.2.3** source (`node_modules/sn-plugin-lib/src`), sn-plugin-template
**1.0.13**, and the code of the reference plugins. Lines marked **Measured**
were recorded on a real device by another plugin's author, almost always on
SDK 0.1.65 and older firmware than our Chauvet 3.31.45, so the M0 probe
re-checks them. Our own device results go in `DECISIONS.md` and win over
anything here.

## Versions and coordinates

- 0.2.3 is the only 0.2.x release (2026-10-12). Its methods are the same as
  0.1.65; the change is coordinates. **Stroke, geometry and picture
  coordinates are page pixels** (`src/module/Element.ts`, stroke section). The
  SDK reports its version to the host in `PluginManager.init()`, which selects
  the coordinate system.
- `PointUtils` and `Element.maxX/maxY` (EMR helpers) are deprecated in 0.2.x.
- Manta page: **1920×2560** portrait, 300 dpi, `PixelRatio` 1.875,
  `getDeviceType()` = 5. The toolbar covers about the top 113 px (Tables).
- **Measured (0.1.65):** `getElements` stroke points were EMR, rotated 90° and
  about 8.45× larger on a Manta (EMR max 21632×16224). Conversion used by
  Ink2Task/Scribble: `px.x = (W-1) - emr.y*(W-1)/maxY`,
  `px.y = emr.x*(H-1)/maxX`.
- **Measured (0.2.3, A5X firmware 2.27.42):** pen-up points were EMR while
  `getElements` returned px (Scribble). Unknown on a Manta → P2.

## Responses and errors

- Most calls resolve `{success, result?, error?: {code, message}}`. `error`
  is present only on failure; `result` only on success. JS-side validation
  returns `{success: false, error: {code: 107 | 100}}` instead of throwing.
  `registerButton`, `registerEventListener` and `recycleElement` throw.
  `PluginManager` methods return plain values.
- Codes we expect to meet: 102 API not allowed in this app (e.g. opened from
  Settings), 105 no note app bound, 106 invalid parameters, 107 validation /
  transfer failed, 116 recognition needs Wi-Fi activation on first use,
  117 recognition failed, 206 element cache full, 207 bad element number,
  303 pen width must be ≥ 100, 813 layer mismatch, 900 no lasso,
  904 no lasso action, 905 invalid selection area, 1201 file missing,
  1202 note already exists, 1207 page doesn't exist, 1500 permission not
  declared, 1501/1502/1503 write/delete/read permission not requested.

## Notes, pages and templates (`PluginFileAPI`)

- `createNote({notePath, template, mode, isPortrait})` — exactly these four
  keys; absolute paths (`/storage/emulated/0/Note/...`); `template` may be a
  PNG path (Ink2Task: `/storage/emulated/0/MyStyle/Ink2Task/x.png`, 1920×2560
  8-bit RGB). 1202 if the note exists. Only works with a note open in the
  editor (102 from Settings).
- `insertNotePage({notePath, page, template})` — Ink2Task passes the same
  absolute PNG path.
- A template is not an element: a blank page has no elements, and the
  background can't be changed after creation.
- `getNotePageTemplate(path, page)` → `{name, md5}`.
- `FileUtils.openFilePath(path)` (Ink2Task) / `PluginFileAPI.openFile(path,
  page)` open a note; Ink2Task closes the plugin view first.

## Reading strokes

- `PluginFileAPI.getElements(page, path)` (page first!) → `Element[]`. Most
  other calls take the path first: `getPageSize(path, page)`,
  `getElement(path, page, num)`, `getElementCounts(path, page)`.
- `PluginCommAPI.getCurrentPageNum()` is 0-based; `numInPage` is 1-based.
- `getCurrentFilePath()` → string. **Measured:** returns the last note the
  plugin touched rather than what's on screen (Ink2Task SKILL #5).
- Element: `uuid`, `type` (0 stroke, 100 title, 200 picture, 500 text,
  600 link, 700 geometry, 800 five-star), `pageNum`, `layerNum`,
  `thickness`, `numInPage`, `stroke{penColor, penType, points,
  recognPoints}`, `geometry`, `picture{picturePath, rect}`, `recycle()`.
- `stroke.points` is an accessor: `await size()` (returns **-1** when empty),
  `await getRange(start, count)` (all-or-nothing: asking past the end returns
  `[]`).
- Every returned element sits in a native cache; free it with `recycle()` or
  calls start failing with 206.
- `getElements` and `getPageSize` need `FILE:READ` even for the open note
  (1503). **Measured:** `getElements` sees ink that hasn't been saved
  (Ink2Task, Scribble). Don't `reloadFile` before reading: it drops unsaved
  ink.
- Pen types (SDK list): 1 pressure, 10 fineliner, 11 marker, 12 fill,
  14, 15 calligraphy, 16 ink pen. **Measured:** lasso strokes arrive at pen-up
  with penType 4 (Snap, Manta) — not in the SDK list.

## Recognition

- `PluginCommAPI.recognizeElements(elements, {width, height})` → string.
  Pass the **page** size from `getPageSize`; a lasso rect throws
  (`getRealMaxX`). Only strokes and text boxes are used.
- 117 can be deterministic for a group; splitting the group in halves often
  recovers it (Ink2Task, recursive, depth 4). **Measured (A5X):** 117 for ink
  near the bottom of the page → keep writing areas above ~85% of the height.
- About 0.3–2 s per call.

## Page buttons and events (`PluginManager`)

- `registerMotionListener(registerType, {onMsg})` — `registerType` 0 first,
  1 normal, 2 last across plugins. Event: `action` (0 down, 1 up, 2 move,
  3 cancel), `toolType` (1 finger, 2 pen), `pressure`, `x`, `y` (page px on
  Ink2Task's devices).
- `registerEventListener('event_pen_up', registerType, {onMsg})` →
  `Element[]`; `numInPage` is 0 until the host commits the stroke.
  Subscription ids are `Date.now()`: two registrations in the same
  millisecond overwrite each other.
- Tap rule (Ink2Task): down and up inside the zone, moved ≤ 50 px;
  `canHandwrite()` false → ignore (menu overlay taps pass through on a Manta);
  2 s debounce; a pen tap leaves an ink dot.
- Don't declare `SYSTEM_ALERT_WINDOW` (suspected to silence the motion
  listener). Reboot after reinstalling, or listeners can fire twice.

## Writing to the page (`PluginCommAPI` / `PluginNoteAPI`)

- `insertGeometry({type, points, penColor, penType, penWidth, ...})` on the
  current page and layer. Types `straightLine`, `GEO_polygon`, `GEO_circle`,
  `GEO_ellipse`. `penWidth` ≥ 100 (1 px per 100; 100/200/300 look the same,
  distinct steps 100/400/900/1600). Colours 0x00, 0x9D, 0xC9, 0xFE.
  Result is `0` (Tables) or truthy (Snap) on success — accept both.
- Geometry can't be filled (zig-zag or spiral to fake it).
- `PluginNoteAPI.insertImage(pngPath)` — **no position**; the host places it.
  A picture element (`createElement(200)`, `picture{picturePath, rect}`,
  `insertPageElements`) has a rect but the SDK calls it "currently unused".
- `insertPageElements / modifyPageElements / deletePageElements /
  batchUpdatePageElements(…, page, layer?)` act on the open note; an explicit
  layer is refused (813) — pass none. Elements must come from
  `createElement` (hand-built → 106). `userData` is discarded (Tables).
- **Never `deletePageElements`**: unbinds the plugin (Tables, 105) and clears
  undo (Snap).
- `batchUpdatePageElements(deleteNums, elements, …)`: deletes then inserts;
  an empty `elements` array is refused (106).
- Lasso: `lassoElements(rect)` (integers, inside the page, no extra keys;
  selects only strokes **fully inside**), `getLassoElements()`,
  `deleteLassoElements()`, `setLassoBoxState(2)` to remove the box.
  **Measured:** undoable on the A5X; on a Manta the delete reported success
  but didn't persist (Scribble); 904 after a few seconds in the panel
  (Tables).
- **Measured:** `saveCurrentNote()` resets undo (Snap).
- **Measured:** the first insert after the panel opens can be dropped on a
  Nomad, never seen on a Manta (Tables). Count and retry anyway.

## Permissions, files, network

- Declared in `PluginConfig.json` `"uses-permissions"`:
  `plugin.permission.INTERNET`, `FILE:READ`, `FILE:WRITE`, `FILE:DELETE`.
- Also requested at runtime: `PluginManager.hasPermission(p)` → 0 no, 1 once,
  2 always; `requestPermission(p, desc?)` → -1 dismissed, 0 refused, 1 once,
  2 always. Treat 1 and 2 as granted. INTERNET too, before the first socket.
- Gated folders: `Document`, `EXPORT`, `INBOX`, `MyStyle`, `Note`,
  `SCREENSHOT`. The plugin's own folder (`getPluginDirPath()`) isn't.
- No text-file write in the SDK (`FileUtils` can copy, rename, delete, list).
  We use react-native-fs, which the host doesn't provide (native build).
- HTTPS only; plain HTTP is blocked on newer firmware.
- RN `alert()` does nothing in the host; use `NativeUIUtils.showRattaDialog`.
- Timers can stall after the plugin view has been shown (Snap). Use
  `Date.now()` comparisons, not `setTimeout`, for anything that matters.

## Build and install

- `buildPlugin.sh` bundles with `--dev false` (no `__DEV__` logs), copies the
  committed `PluginConfig.json`, compiles native modules with Gradle
  (`buildCustomApkDebug` → `app.npk`, arm64 only) and fills `reactPackages`
  from autolinking, then zips `build/generated/`.
- It exits 0 when Gradle fails and never cleans `build/` — CI runs
  `rm -rf build` first and checks the package.
- `.snplg` name = `pluginKey` = `app.json` name = `SupernotePuzzles`.
- Install with Settings → Apps → Plugins → **Add Plugin**; Reinstall uses the
  stale copy in `MyStyle/Plugins/`. `versionCode` must rise.
