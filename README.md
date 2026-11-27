# Supernote Puzzles (sn-word-games)

A Supernote Manta plugin for playing the NYT games and Minute Cryptic with the
pen on a real note page. The puzzle is the page's template; you write with
NOTE's own ink; the plugin reads your letters when you tap a button printed on
the page.

Status: **M0, the device probe build.** See `docs/DESIGN.md` for the plan,
`docs/DECISIONS.md` for decisions, `docs/SDK-NOTES.md` for the SDK facts we
rely on, and `docs/M0-DEVICE-CHECKLIST.md` for the device test.

## Install on the Manta

Needs firmware Chauvet 3.30.45 or later (developed on 3.31.45).

1. GitHub → Actions → the latest green **CI** run → Artifacts → download the
   `.zip`. **Don't unzip it**: the Supernote unpacks it when you install.
2. Copy the downloaded file to `MyStyle/` on the device.
3. Settings → Apps → Plugins → **Add Plugin** → choose it (Reinstall uses an
   old copy). A build with the same or a lower `versionCode` than the one
   installed is refused with "The plugin version is too low".

Tagged releases (`v*`) also attach the `.snplg` to a GitHub Release.

## Develop

```bash
npm ci
```

```bash
npm run check
```

`npm run check` runs ESLint, TypeScript and Jest. After changing anything in
`src/layout/` or `src/render/`, regenerate the embedded templates (CI fails if
they're stale):

```bash
npm run render-templates
```

The `.snplg` is built by CI (`buildPlugin.sh` needs the Android SDK for the
react-native-fs native module). `versionCode` is `1000 + CI run number`.

## Layout

- `src/layout`, `src/render`, `src/ink`, `src/recognise`, `src/diag`: pure
  TypeScript, unit-tested.
- `src/sdk/device.ts`: the only code that touches `sn-plugin-lib` and
  react-native-fs; everything else uses the interfaces in `src/sdk/types.ts`.
- `src/probes`: the M0 probes P1–P6 behind the Probes menu (`src/ui`).
- `scripts/render-templates.ts`: renders page templates (resvg + Libre
  Franklin, OFL) into `src/assets/templates.generated.ts`.
