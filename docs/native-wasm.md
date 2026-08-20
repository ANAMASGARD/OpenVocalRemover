# Optional C++ to WebAssembly decision

Current decision: **deferred; do not add C++ or a second Wasm runtime.**

`models/model-lock.json` selects no production model, so there is no valid
Firefox live profile showing where a selected separator spends its deadline.
Adding Emscripten, native source, generated binaries, glue code, and another
allocation boundary now would increase package size and review surface without
evidence that it improves the limiting path.

## Evidence gate

`evaluateNativeWasmDecision` accepts a native experiment only when all of these
conditions hold:

1. A production model is approved and the profile names that exact model.
2. The profile comes from the Firefox v1 Wasm path and contains positive p95
   preprocessing, inference, postprocessing, and model-hop measurements.
3. Real deadline misses occurred.
4. Combined TypeScript preprocessing/postprocessing p95 exceeds half the model
   hop and is greater than inference p95.

If inference is the bottleneck, C++ DSP cannot solve the measured problem. If
queues meet their deadline, native code has no product justification. A future
eligible result authorizes only a small experiment—not shipment.

## Requirements for a future experiment

- Pin an open-source Emscripten toolchain and document one reproducible command.
- Implement only the measured hotspot: deterministic STFT/iSTFT, overlap-add,
  resampling, or a bounded ring-buffer helper.
- Keep neural inference in ONNX Runtime Web; never reimplement the model in C++.
- Expose a narrow typed interface with caller-owned buffers and bounded memory.
- Compare against a TypeScript reference using identical fixtures, including
  channel layout, frame count, numerical tolerance, allocation behavior, and
  malformed input.
- Benchmark warm and p95 performance in current Firefox on the same machine and
  model. Ship only if the native path materially reduces end-to-end p95 without
  weakening fail-open behavior or Chrome/Firefox packaging.
- Include native dependency licences, generated-artifact checksums, source maps
  needed for review, and a JavaScript fallback in the same reviewed change.

Until that evidence exists, the absence of `native/` is intentional and is the
completed outcome of roadmap Task 15.
