# AMO source-build instructions

This archive contains the readable source used to build Open Vocal Remover for
Firefox. It is submitted separately from the user-facing extension archive.

## Build environment

- Linux (the release maintainer records the exact distribution and CPU
  architecture in the AMO reviewer notes)
- Node.js 24.14 or later within major version 24
- npm 11.9 or later within major version 11
- `zip` and `unzip` for local archive inspection

Mozilla's documented default reviewer environment was Ubuntu 24.04.4 ARM64,
Node 24.14.0, and npm 11.9.0 when these instructions were reviewed on
2026-08-20. Re-check Mozilla's source-submission documentation before release.

## Reproduce and verify

From the archive root:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build:firefox
npm run smoke:firefox
```

The extracted Firefox extension is written to `dist/firefox/`, with
`dist/firefox/manifest.json` at its root. Create a local package preview with:

```bash
npm run package:firefox:preview
```

The production `npm run package:firefox -- --evidence <redacted-evidence.json>`
command deliberately refuses to package unless the checked-in model lock
selects an approved model and every validated Firefox manual check passes.

All dependencies come from the public npm registry using `package-lock.json`.
The build uses Vite and CRXJS, so this source archive is required for AMO review.
ONNX Runtime Web is pinned exactly in `package.json`; its unmodified runtime
files and licence are copied into the extension build. No remote build service,
CDN, proprietary compiler, telemetry, or model download is used.
