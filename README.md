# Open Vocal Remover

Open Vocal Remover is a cross-browser extension foundation for Chrome and Firefox. It currently supplies only an accessible popup and no audio-processing behavior, browser permissions, or host permissions.

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

Both development servers can run at once: Chrome uses port 5173 and `dist/chrome/`; Firefox uses port 5174 and `dist/firefox/`. This separation prevents one browser's development manifest from overwriting the other's.

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
- `src/shared/` holds extension-wide constants and types.
- `src/platform/` is the only future boundary for browser API access.
- `src/content/` and `src/background/` are reserved for future extension contexts. Do not register either in the manifest until a concrete feature needs it.
