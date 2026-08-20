# Open Local Remover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Track work with the checklist items in each task.

**Goal:** Deliver a Firefox-first, local-only, best-effort YouTube vocal-reduction extension with a bounded fixed-latency audio path and safe original-audio restoration.

**Architecture:** A user enables processing from the React popup. A narrow YouTube content script manages a reversible Web Audio graph, AudioWorklets transport bounded audio blocks, and a dedicated module worker runs a locally packaged two-stem ONNX model through ONNX Runtime WebAssembly. All failures bypass to original media audio.

**Tech Stack:** TypeScript (strict), React, Vite, CRXJS, Manifest V3, Web Audio API, AudioWorklet, Web Worker, `onnxruntime-web/wasm`, Vitest, ESLint.

---

> Scope: a private, local, best-effort YouTube vocal-reduction extension. It
> does not promise perfect "instruments only" output. Version 1 targets Firefox
> and WebAssembly CPU execution; Chrome remains buildable but is not the initial
> store-release target. No audio or model requests may leave the device.

## Product and technical decisions

- **User-visible name:** Open Local Remover.
- **Release order:** Firefox first, then Chrome compatibility and optional
  WebGPU acceleration after Firefox has stable measured behaviour.
- **Playback contract:** activation pauses the video once, buffers 2--3 seconds,
  resumes through the processed path, and keeps that fixed latency. If processing
  misses a deadline or fails, restore original video audio immediately.
- **Inference:** `onnxruntime-web/wasm` in a dedicated module worker. Start with
  SIMD, single-threaded configuration. Do not assume Wasm threads: YouTube content
  scripts are not reliably cross-origin isolated.
- **Initial model candidate:** a locally bundled, licensed **Spleeter 2-stem
  INT8 ONNX** export. It is the low-CPU speed candidate; it is not presumed to
  win without measurement. Retain a compatible FP16 export only as a test
  fallback. HTDemucs is an explicitly deferred quality benchmark candidate,
  not a v1 asset.
- **Audio graph:** `HTMLVideoElement -> MediaElementAudioSourceNode -> capture
  AudioWorklet -> bounded worker queue -> playback AudioWorklet -> speakers`.
  Do not use deprecated `ScriptProcessorNode`, page monkey patches, media network
  interception, or a fake future-frame lookahead.
- **C++/Wasm:** no C++ in the first inference implementation. C++ compiled with
  Emscripten may be added only after profiling proves that JavaScript DSP causes
  missed deadlines; it may implement STFT/iSTFT, overlap-add, resampling, or a
  ring buffer. It must never reimplement neural-network inference.

## Quality gates used by every commit

Run the relevant checks before committing, plus the full release gate for every
release-candidate commit:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run build:firefox
git diff --check
```

Manual checks are done in a clean Firefox profile against several YouTube video
types: ordinary music, a live performance, a mono/near-mono upload, an advert,
and a normal non-YouTube page. Capture browser-console errors, latency, dropouts,
and CPU use for the benchmark record. Never test by recording or uploading a
user's audio.

## Implementation file map

| Location | Responsibility | First task |
| --- | --- | --- |
| `README.md`, `docs/architecture.md`, `docs/benchmarking.md` | Product limits, privacy policy, architecture, and performance requirements. | 1 |
| `src/extension/`, `src/platform/`, `src/test/` | Browser abstraction, manifest assertions, and deterministic test helpers. | 2 |
| `src/shared/` | Validated cross-context messages, audio-frame types, constants, and settings. | 3 |
| `src/content/` | YouTube lifecycle, reversible media graph, worker client, and fail-open orchestration. | 4–7, 11 |
| `src/audio-worklets/` | Allocation-conscious capture and scheduled playback. | 6 |
| `src/inference/`, `src/worker/` | Local ONNX Runtime Wasm configuration, benchmark harness, model adapter, and inference worker. | 8–10 |
| `public/models/` | Exactly one approved model plus licence and provenance metadata. | 9 |
| `src/popup/` | Explicit activation and truthful processing/bypass status. | 12 |
| `docs/benchmarks/`, `docs/release-checklist.md` | Redacted performance evidence and Firefox release checks. | 13–14 |
| `native/` | Optional profiler-gated C++-to-Wasm DSP helper only. | 15 |

## Commit sequence

### 1. `docs: define supported playback and local-processing boundaries` ✅

Files: `README.md`, `docs/architecture.md`, `docs/benchmarking.md`, `.gitignore`.

- [x] State the best-effort limitation, supported YouTube URLs, privacy guarantee,
  no model downloads, and fail-open audio policy.
- [x] Add diagrams for the fixed-latency audio path and popup/content/worker message
  boundaries.
- [x] Define the initial benchmark machine matrix and acceptance metrics: first
  processed audio within 3 seconds after activation; no sustained queue growth;
  restore original audio within one audio block after a fatal failure.
- [x] Ignore only generated traces and profiling captures, never model provenance.

Acceptance: documentation contains no promises of 90--100% removal or lossless
instrumentals; all existing checks pass.

### 2. `chore: establish extension build targets and test foundations` ✅

Files: `package.json`, `vite.config.ts`, `src/extension/*`, `src/**/*.test.ts`,
`vitest.config.ts` if needed.

- [x] Preserve separate `dist/firefox` and `dist/chrome` outputs.
- [x] Add a browser abstraction with the smallest useful surface (runtime messaging,
  storage, tab identification). Browser API differences belong here, not inside
  audio code.
- [x] Add test helpers for message payload validation and deterministic audio-block
  fixtures.
- [x] Keep live commands distinct: `npm run dev:firefox` serves Firefox on 5174;
  `npm run dev` serves Chrome on 5173. Their HMR sockets cannot share one server.

Acceptance: the two built manifests are inspected in tests: Firefox uses
`background.scripts`; Chrome uses `background.service_worker` only.

### 3. `feat: add typed audio, settings, and lifecycle protocol` ✅

Files: `src/shared/protocol.ts`, `src/shared/audio.ts`, `src/shared/settings.ts`,
unit tests.

Define the only cross-context data contracts. Example shape:

```ts
export type ProcessingState =
  | 'idle' | 'arming' | 'buffering' | 'processing' | 'bypassed' | 'error';

export type WorkerRequest =
  | { type: 'initialise'; sampleRate: number; channels: 1 | 2 }
  | { type: 'process'; sequence: number; frames: Float32Array[] }
  | { type: 'dispose' };

export type WorkerResponse =
  | { type: 'ready'; backend: 'wasm-simd' | 'wasm' }
  | { type: 'processed'; sequence: number; frames: Float32Array[] }
  | { type: 'failure'; operation: string; message: string };
```

- [x] Validate every received message and transfer `ArrayBuffer`s rather than cloning
  large audio payloads.
- [x] Centralise sample rate, channels, chunk size, 2--3 second latency, queue cap,
  deadline, and model identifier in a typed configuration module.

Acceptance: malformed messages, sequence gaps, transfer ownership, and settings
defaults have focused unit tests.

### 4. `feat: inject a minimal YouTube lifecycle content script` ✅

Files: `manifest.config.ts`, `src/content/index.ts`, `src/content/youtube.ts`,
content-script tests.

- [x] Request only `storage`, `activeTab`, and narrow `https://www.youtube.com/*`
  host matches needed for the feature; do not request `<all_urls>`.
- [x] Detect the active `HTMLVideoElement` after initial navigation and SPA route
  changes. Ignore pages with no valid playable video.
- [x] Expose idempotent `attach`, `detach`, `enable`, and `disable` operations.
- [x] Keep it inactive until an explicit popup toggle requests activation.

Acceptance: repeated YouTube route changes create no duplicate observer or graph;
non-YouTube pages receive no content script; disabling is safe before activation.

### 5. `feat: route media audio through a reversible Web Audio graph`

Files: `src/content/media-audio-controller.ts`, tests with Web Audio fakes.

- Construct exactly one `AudioContext` and one `MediaElementAudioSourceNode` for
  the selected video, retaining references until teardown.
- Initially route capture directly to destination so the graph can be tested
  before inference exists.
- Implement a transactional attach: if any node or connection fails, disconnect
  what was created and leave native playback audible.
- Teardown on disable, video replacement, page unload, and fatal error; never
  mute or pause unrelated media.

Acceptance: fake graph tests cover one source per media element, reconnection,
and complete rollback. Manual Firefox test proves normal audio returns after
disable and after navigation.

### 6. `feat: add capture and playback AudioWorklets with a bounded buffer`

Files: `src/audio-worklets/capture-processor.ts`,
`src/audio-worklets/playback-processor.ts`, `src/content/audio-pipeline.ts`, tests.

- Capture fixed-size channel-separated blocks from the graph. The playback
  worklet outputs processed blocks in sequence and emits silence only while the
  initial fixed buffer is filling.
- Bound both pending and ready queues. Overflow, underflow, channel mismatch, or
  stale sequence numbers are explicit telemetry events, not unbounded memory.
- Use `AudioWorkletNode.port` first; introduce `SharedArrayBuffer` only after
  verifying isolation in the exact extension context, with a transfer-based
  fallback always retained.

Acceptance: deterministic tests prove ordering, queue caps, frame accounting,
and no allocations growing with playback duration. Manual activation pauses,
buffers, then resumes once with fixed latency.

### 7. `feat: add phase-reduction bridge and bypass controller`

Files: `src/audio/phase-reduction.ts`, `src/content/bypass-controller.ts`, tests.

- Provide an optional, clearly labelled short bridge during initial buffering:
  a conservative mid-channel attenuation, not a claim of full separation.
- Crossfade between bridge, processed, and original routes to avoid clicks.
- Any deadline miss, worklet failure, worker crash, seek, ad replacement, or
  configuration mismatch must crossfade to original audio and report `bypassed`.

Acceptance: crossfade and fail-open tests pass; seek/ad/worker-error manual
tests preserve playable original audio instead of stalling or muting the video.

### 8. `feat: add local ONNX Runtime Wasm benchmark harness`

Files: `src/inference/ort-wasm.ts`, `src/inference/benchmark.ts`,
`scripts/benchmark-model.mts`, `docs/benchmarks/README.md`, tests.

- Add the `onnxruntime-web` dependency and explicitly import its Wasm build.
- Bundle the required ORT Wasm assets locally and set `ort.env.wasm.wasmPaths`
  to extension-local URLs. Disable remote CDN fallback.
- Try SIMD first and record the selected backend. Do not enable threads unless
  runtime isolation has been observed and a fallback test passes.
- Benchmark real representative chunks: warm-up, median and p95 inference time,
  heap growth, and processed-seconds/elapsed-seconds. No model is accepted
  merely because it loads.

Acceptance: benchmark is reproducible offline and writes a JSON result with
browser version, sample rate, model checksum, backend, p50/p95 time, and pass or
fail against the fixed latency budget.

### 9. `feat: bundle the approved two-stem ONNX model with provenance`

Files: `public/models/<selected-model>/*`, `models/README.md`,
`models/model-lock.json`, `.gitattributes`.

- Benchmark Spleeter 2-stem INT8 first. Select it only if it runs faster than
  realtime with reserve headroom and produces acceptable listening results on the
  target Firefox CPU. Otherwise evaluate its FP16 export, then a small MDX-Net
  candidate using the exact same harness.
- Commit only the winner and its license, upstream source URL/revision, SHA-256,
  tensor names/shapes, sample-rate assumptions, and model-card limitations.
- Store binary `.onnx` files through Git LFS if repository policy permits; CI
  verifies checksums after LFS checkout. Do not ship both production models.

Acceptance: offline build includes the model once, its checksum test passes, and
the manifest exposes no network permission or external model URL.

### 10. `feat: run two-stem inference in a dedicated Wasm worker`

Files: `src/worker/inference-worker.ts`, `src/inference/model-session.ts`,
`src/inference/separation.ts`, tests.

- Initialise one model session per active video in a module worker. Configure
  ORT before session creation, load only extension-packaged assets, and dispose
  tensors and sessions on teardown.
- Implement model-specific preprocessing, chunk/windowing, overlap-add,
  accompaniment selection, and output length checks behind a `Separator`
  interface. Never let model tensor details leak into content or popup code.
- Post processed blocks with the original sequence number. Return a typed
  failure for unsupported input, model load failure, and inference exceptions.

Acceptance: fixture tests verify tensor dimensions, output-frame reconstruction,
sequence preservation, resource disposal, and worker failure propagation.

### 11. `feat: connect worker inference to realtime playback scheduling`

Files: `src/content/audio-pipeline.ts`, `src/content/inference-client.ts`,
integration tests.

- Connect the bounded capture queue to the worker and worker responses to the
  playback queue. Processing may begin only after the configured initial buffer
  is available.
- Maintain a deadline monitor: if p95-equivalent live work exceeds headroom or
  the queue falls below its low-water mark, bypass before audible stutter.
- Reset the pipeline cleanly on seek, playback-rate change, new video, and
  video end. Never attempt to fetch future YouTube audio frames.

Acceptance: integration tests simulate normal flow, late worker responses,
out-of-order blocks, seek, and cancellation. Firefox manual test has no sustained
dropouts on the benchmark target while active.

### 12. `feat: finish popup controls and observable status`

Files: `src/popup/*`, `src/shared/settings.ts`, tests.

- Implement enabled toggle, conservative reduction amount, status badge, model
  name/version, backend, buffered latency, and bypass/error explanation.
- Persist only user settings locally. Do not collect history, URLs, audio,
  telemetry, or account data.
- Disable unsupported controls rather than allowing a configuration that causes
  distortion or exceeds the benchmarked budget.

Acceptance: popup tests cover settings persistence and message state rendering;
manual toggles work across a YouTube SPA navigation and report bypass truthfully.

### 13. `test: add Firefox release smoke tests and performance evidence`

Files: `tests/*`, `docs/benchmarks/*.json`, `docs/release-checklist.md`.

- Add unit/integration coverage for the lifecycle, buffer math, worker protocol,
  model integrity, and fail-open transitions.
- Add a manual release checklist: temporary add-on load from `dist/firefox`,
  popup behaviour, route changes, ads, seek, disabling, worker crash, and a
  browser restart.
- Publish benchmark evidence by machine class; mark machines that do not meet
  realtime budget as unsupported instead of silently stuttering.

Acceptance: clean Firefox profile passes the release checklist and all automated
quality gates. The package works offline after installation.

### 14. `release: package Firefox first and document Chrome status`

Files: `README.md`, `docs/firefox-submission.md`, `docs/chrome-status.md`,
package scripts as needed.

- Produce an AMO-ready package from the Firefox build, with reproducible version
and clean build instructions. Verify manifest, icons, model asset inclusion,
and source-map/privacy requirements against current AMO policy before upload.
- Keep Chrome generated and locally testable using `dist/chrome`; do not describe
  it as store-ready until its own verification is complete.
- Explain dev processes: run `npm run dev:firefox` for Firefox only; run
  `npm run dev` for Chrome only; run both in two terminals to test both HMR
  targets simultaneously. Built folders never depend on a dev server.

Acceptance: a fresh checkout can install dependencies, build Firefox, load the
temporary add-on, and execute the release checklist without undocumented files.

### 15. `perf: evaluate optional C++ Wasm DSP only from profiler evidence`

Files: `native/` only if benchmark results prove a DSP bottleneck, plus
`docs/native-wasm.md`, tests, and build scripts.

- First capture a profile that shows preprocessing/postprocessing—not ONNX
  inference—is the deadline bottleneck. If not, do not add native code.
- Implement the smallest portable C++ module for the proven hotspot, compile it
  to browser WebAssembly with Emscripten, and expose a narrow typed boundary.
- Compare JavaScript and C++ Wasm using identical fixtures and preserve the
  JavaScript fallback. This commit is optional and must not block the Firefox v1
  release.

Acceptance: the native implementation produces equivalent fixture outputs within
the documented tolerance and lowers measured p95 processing time without breaking
Firefox packaging.

## Deliberately deferred work

- Chrome WebGPU: evaluate only after the Wasm v1 is stable. It must remain an
  optional acceleration path because Firefox support is not equivalent and GPU
  availability varies.
- HTDemucs: benchmark later for quality; do not put its larger model or compute
  cost into the initial extension.
- True future-audio lookahead, network interception, cloud separation, user
  uploads, and data collection are out of scope.

## Model recommendation at this point

Use **Spleeter 2-stem INT8 ONNX as the first benchmarked candidate**, because it
is designed for two-stem separation and is the most credible lower-CPU starting
point among the considered model families. It is a speed choice, not a quality
guarantee. The actual shipped artifact is decided only by commit 9's offline
Firefox benchmark gate. If it cannot maintain realtime with safety headroom,
the correct v1 result is a smaller supported model or an explicit unsupported
machine message—not hidden stutter or a false "instant" claim.
