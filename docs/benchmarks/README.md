# Committed Firefox benchmark evidence

This directory holds only redacted aggregate evidence for a model that has
already passed the provenance and causal-interface gates. It intentionally
contains no benchmark result today because `models/model-lock.json` selects no
model. A successful build is not performance evidence.

## Required record

Create one JSON record per measured machine tier and validate it through
`parseFirefoxBenchmarkRecord` in `src/release/benchmark-record.ts`. Use a
descriptive filename such as `<model-id>-firefox-tier-a.json`.

Every record must contain:

- schema version, machine tier (`A`, `B`, or `C`), and an explicit `supported`
  or `unsupported` decision;
- exact Firefox, operating-system, ONNX Runtime, model checksum, backend,
  single-thread configuration, sample-rate, channel, frame, hop, and latency
  information;
- warm-up, p50, p95, retained-memory, real-time-factor, queue-growth, dropout,
  end-to-end latency, and fail-open measurements;
- a generic description of permitted test media, never its URL, video ID,
  account information, title, or raw audio.

A `supported` result is rejected unless p95 inference is at most half of the
model hop duration, the real-time factor is at least 1, algorithmic and measured
end-to-end latency are each at most 100 ms, queues remain bounded, no audible
dropout is observed, and injected failure restores original audio within
100 ms. A failing device is recorded as `unsupported`; measurements are never
altered or omitted to make a tier appear supported.

Temporary traces and profiles remain under `.local-benchmarks/` and are ignored
by Git. Do not commit raw audio, full YouTube URLs, browsing history, or local
profile data.
