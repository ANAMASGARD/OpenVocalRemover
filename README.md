# Open Vocal Remover

Open Vocal Remover is a free, open-source browser extension for **best-effort,
local AI vocal reduction** on explicitly activated, supported YouTube watch
pages. Audio, model inference, and derived buffers stay on the user's device.

The current codebase supplies an accessible popup, separate browser build
targets, and an inactive YouTube watch-page lifecycle. It does not yet alter
audio or include a model. Its only requested permissions are `activeTab` and
`storage`, with a content-script match limited to
`https://www.youtube.com/watch*`. The staged implementation roadmap is in
[the Firefox-first plan](docs/superpowers/plans/2026-08-12-firefox-wasm-vocal-reduction.md).

## Product boundaries

- This project does not promise perfect separation, instrumental-only output, a
  fixed percentage of vocal reduction, artifact-free audio, or support for every
  YouTube stream. Results depend on the recording, backing vocals, reverb,
  stereo effects, and the device.
- The first public release is Firefox-first and uses a local WebAssembly CPU
  inference path. Chrome remains a shared build target; WebGPU is a later,
  optional acceleration path.
- Processing will require an explicit user action on a supported YouTube watch
  page (`https://www.youtube.com/watch*`, including SPA navigations that keep
  the user on a playable watch page). Other YouTube surfaces and non-YouTube
  pages are out of scope. It will never activate automatically.
- The production audio path must fail open: any error, deadline miss,
  navigation, disable action, or unsupported capability immediately restores
  the original YouTube audio.
- The extension will not use a server, CDN model download, upload, analytics,
  or telemetry. A model and its runtime assets will be packaged inside the
  extension before any inference feature is enabled.

See [the architecture](docs/architecture.md) and
[benchmarking requirements](docs/benchmarking.md) for the implementation
contracts.

## Requirements

- Node.js 20.19+ or 22.12+
- Google Chrome/Chromium and/or Firefox

## Development

```bash
npm install
# Chrome or Chromium development
npm run dev
```

CRXJS writes the Chrome development extension to `dist/chrome/`. In Chrome or Chromium, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/chrome/`.

For Firefox, stop the Chrome development server first and run:

```bash
npm run dev:firefox
```

Then open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `dist/firefox/manifest.json`. The Firefox mode emits Firefox-compatible background metadata for CRXJS development reloads.

Both development servers can run at once: Chrome uses port 5173 and
`dist/chrome/`; Firefox uses port 5174 and `dist/firefox/`. This separation
prevents one browser's development manifest from overwriting the other's.

## Verification and production build

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run build:firefox
```

Load `dist/chrome/` in Chrome after `npm run build`, and use `dist/firefox/manifest.json` after `npm run build:firefox`. For Firefox store distribution, package and sign the built extension through AMO; the manifest already has its permanent Gecko ID and declares that it collects no data.

## Project boundaries

- `src/popup/` contains the active React extension surface.
- `src/shared/` holds extension-wide constants, types, and later the validated
  messages exchanged between extension contexts.
- `src/platform/` is the only boundary for browser API access (messaging,
  storage, and active-tab identification).
- `src/extension/` holds build-output helpers used to assert Chrome versus
  Firefox manifest shapes.
- `src/test/` holds deterministic message and audio-block fixtures for unit
  tests.
- `src/background/` is a minimal MV3 background entry so Chrome and Firefox
  builds emit the correct background shape. Feature behavior is added later.
- `src/content/` owns the inactive YouTube watch-page lifecycle and later the
  reversible media controller. It must never depend on YouTube private state or
  alter audio before explicit user activation.
- Future audio work uses `src/audio-worklets/` for real-time capture/playback
  and `src/worker/` for inference. Inference and model details must not be put
  into popup components or an audio render callback.
- Packaged model assets belong in `public/models/`, accompanied by provenance
  metadata. They never belong in `src/public/` and are never downloaded at
  runtime.
