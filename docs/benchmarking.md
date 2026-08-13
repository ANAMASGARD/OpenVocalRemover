# Real-time benchmarking contract

The selected model and inference configuration are accepted only after an
offline, reproducible Firefox measurement. A model that loads successfully is
not automatically suitable for real-time playback.

## Initial candidate and decision rule

Benchmark a licensed, locally packaged **Spleeter 2-stem INT8 ONNX** candidate
first. It is a speed-oriented starting point, not a promised quality result.
If it fails the real-time gate, test only a compatible FP16 export and then one
smaller MDX-Net candidate using the identical process. HTDemucs is deferred
unless later measurements show it meets the fixed-latency budget.

Only one production model is shipped. Its provenance, checksum, supported
configuration, and measurements are committed with the model. No benchmark may
download a model or send audio, model data, or measurements to a remote service.

## Required benchmark record

For each candidate record locally:

- browser name and exact version;
- operating system, CPU model, available memory, and GPU only as descriptive
  hardware information;
- model filename, SHA-256, source revision, license, input tensor layout,
  sample rate, channel count, chunk size, and hop size;
- ONNX Runtime version, selected Wasm backend (`wasm-simd` or `wasm`), and
  whether threads were available;
- warm-up time, median and p95 per-chunk inference time, peak retained memory,
  processed-seconds / elapsed-seconds real-time factor, buffer occupancy, and
  audible dropout count;
- whether original audio was restored on a deliberately injected worker failure
  and deadline miss.

Use permitted or licensed YouTube test material. Never store raw audio, full
video URLs, account identifiers, or browsing history in the record.

## Initial benchmark machine matrix

Measure the same candidate on at least these Firefox desktop tiers before
declaring support:

| Tier | Representative hardware | Role |
| --- | --- | --- |
| A | Recent laptop/desktop CPU with AVX2-class SIMD and 16 GB RAM | Primary supported target; must pass live gates |
| B | Mid-range laptop CPU with 8 GB RAM | Secondary target; must pass or be marked unsupported |
| C | Low-end / thermally limited laptop | Explicit unsupported reference if live gates fail |

Record each tier separately. Do not average across machines. A failing tier is
unsupported for live processing; the extension must bypass rather than stutter.

## Acceptance gates

The candidate passes the live path only when all of the following hold on each
declared supported Firefox hardware tier:

1. First processed audio begins no later than three seconds after explicit
   activation and the one-time initial buffer.
2. The system remains inside its fixed 2–3 second buffer budget; it does not
   grow latency during extended playback.
3. p95 processing retains enough reserve to process future chunks before their
   playback deadline; pending and ready queues do not grow continuously.
4. No sustained stutter or repeated silent blocks occur in the test run.
5. Worker failure, seek, navigation, and deadline-miss tests restore original
   audio within one output audio block.

If a machine cannot meet these gates, it is unsupported for live processing and
the extension must bypass safely. Do not conceal the result with an endless
buffer or an "instant" claim.

## Generated local artifacts

Keep temporary profiles and local benchmark captures out of Git. They may be
stored in `.local-benchmarks/` or produced as `*.cpuprofile` and `*.trace.json`.
Committed benchmark summaries must be redacted, reproducible, and contain only
the required aggregate measurements above. Model provenance is source material
and must never be ignored.
