# Architecture contract

## Scope

Open Vocal Remover will provide best-effort local vocal reduction for an
explicitly enabled YouTube watch-page video
(`https://www.youtube.com/watch*`). It is not a claim of perfect source
separation. Other YouTube surfaces and non-YouTube pages are unsupported. The
extension must preserve normal YouTube audio when disabled or when any part of
processing is unavailable.

The first release is Firefox-first. It uses `onnxruntime-web/wasm` with SIMD
when supported and a single-threaded fallback. Chrome builds from the same code
base; WebGPU is not required for the first release.

## Audio path

The production path is fixed and every queue is bounded:

```text
YouTube <video>
  -> MediaElementAudioSourceNode
  -> AudioWorklet capture
  -> fixed 2–3 second ring buffer
  -> dedicated inference worker
  -> AudioWorklet scheduled playback
  -> speakers
```

On enable, the extension pauses the selected video once, fills the initial
2–3 second buffer, then resumes it through this processed path. It does not
claim to obtain future YouTube audio frames. A missed output deadline is a
failure: the graph must safely restore original audio rather than increase
latency, loop silence, or stutter.

`AudioWorklet` is required for capture and scheduled playback. Do not introduce
`ScriptProcessorNode`; it runs on the main thread. Audio render callbacks must
not await, fetch, load a model, run inference, or allocate unbounded memory.

## Extension boundaries

```text
React popup
  -> validated runtime message
  -> YouTube content script and media controller
  -> AudioWorklet ports <-> inference-worker module
  -> local ONNX Runtime Wasm and packaged model
```

Every message crossing popup, content script, worker, or worklet boundaries is
a discriminated TypeScript message and is validated by the receiver. Large audio
buffers are transferred deliberately; page-provided objects are never trusted.
The content script does not depend on YouTube private JavaScript state and does
not inject application logic into YouTube's main world.

The content script owns lifecycle changes: initial video selection, YouTube SPA
navigation, seek, pause, playback-rate changes, replacement video, disable, and
page unload. Its operations must be idempotent and must leave no duplicate
media routing after teardown.

## Inference boundary

The inference worker owns model-session creation, preprocessing, separation,
and postprocessing. It uses only extension-packaged assets:

```text
public/models/<model>/
  model.onnx
  provenance.json
  LICENSE-or-attribution.txt
```

The provenance record must include the upstream source URL and exact revision,
license/attribution, SHA-256, sample rate, channel layout, tensor names, chunk
and hop sizes, and output semantics. Runtime model downloads, CDNs, uploads,
analytics, and remote processing are prohibited.

The first backend is `onnxruntime-web/wasm`, configured with extension-local
Wasm URLs. WebAssembly threads cannot be assumed in a YouTube content-script
context; SIMD is feature-detected and a safe single-thread path is retained.

C++ compiled with Emscripten is not part of the initial implementation. It may
be proposed only after profiling identifies a DSP bottleneck outside ONNX
inference. If accepted, it is limited to deterministic DSP such as STFT/iSTFT,
overlap-add, resampling, or bounded ring-buffer helpers and must have a narrow,
typed interface plus parity tests against a TypeScript reference.

## Failure and privacy contract

Any error, unsupported capability, worker failure, queue overflow/underflow,
deadline miss, navigation, or disable action restores original audio promptly.
The popup must display this bypass state rather than imply processing continues.

The implemented feature must request only the permissions and YouTube host
matches it needs. It must not request `<all_urls>`. Diagnostics, if introduced,
are opt-in, aggregate, local-only, and never contain raw audio, model buffers,
full video URLs, identifiers, or activity history.
