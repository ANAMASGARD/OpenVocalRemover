# Firefox release checklist

Current status: **blocked — no causal model is approved and no live Firefox
evidence exists.** This checklist is executable release work, not a claim that
the extension currently performs vocal reduction.

Run it from a clean checkout and a clean Firefox profile. Use only music or
video you are permitted to test. Record aggregate results through
`FirefoxManualEvidence`; never record the URL, video ID, account, raw audio, or
browsing history.

## Automated gate

- [ ] Install with the lockfile: `npm ci`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run build:firefox`.
- [ ] Run `git diff --check`.
- [ ] Confirm `models/model-lock.json` selects exactly one approved model and
  its checksums, licences, provenance, browser benchmarks, and tensor contract
  pass the model gate.

## Clean Firefox profile

1. Build Firefox with `npm run build:firefox`.
2. Open `about:debugging#/runtime/this-firefox` in a clean Firefox profile.
3. Select **Load Temporary Add-on** and choose
   `dist/firefox/manifest.json`.
4. Confirm the popup identifies the selected model and Wasm backend. If it says
   **Not available yet**, stop: release readiness has correctly failed.
5. Open a supported YouTube `/watch` page containing permitted stereo music.
6. Activate processing explicitly. If Firefox requires page activation, use
   only the extension's visible activation control.

## Required live checks

- [ ] Temporary installation reports no manifest error.
- [ ] Processing never starts before explicit activation.
- [ ] Enable reaches truthful warming/processing status within the approved
  model's measured budget.
- [ ] Disable restores original audio without duplicate routing.
- [ ] YouTube SPA navigation restores original audio and creates one new
  session only.
- [ ] Seek, pause, playback-rate change, video replacement, and video end each
  restore original audio.
- [ ] Injected worker failure and deadline miss restore original audio within
  100 ms.
- [ ] Buffer occupancy remains bounded; no sustained queue growth or repeated
  silent blocks occur.
- [ ] Developer Tools network inspection shows no audio, model, derived-buffer,
  analytics, or telemetry request leaving the device.
- [ ] A browser restart leaves processing disabled until a new explicit action.

## Evidence and decision

- [ ] Record exact Firefox/OS/model/backend settings and aggregate measurements
  in `docs/benchmarks/` using the validated benchmark-record format.
- [ ] Record each required live check as `passed`, `failed`, or `not-run` using
  `FirefoxManualEvidence` from `src/release/release-readiness.ts`.
- [ ] Mark each measured machine tier unsupported if it misses any live gate.
- [ ] Package or submit only when `assessFirefoxReleaseReadiness` returns
  `{ ready: true }`.

Failure is safe: stop processing, preserve the original YouTube audio, retain
the honest evidence, and do not publish an AMO-ready claim.
