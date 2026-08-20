# Causal model research gate

Status: **no production model approved**. `models/model-lock.json` intentionally
sets `selectedModelId` to `null`.

The live path requires a causal two-stem artifact that fits the 100 ms A/V
budget, runs through single-thread ONNX Runtime Web Wasm in current Chrome and
Firefox, has explicit weight-level redistribution terms, and keeps the complete
extension package at or below 150 MiB. Published native or desktop results are
candidate evidence, not browser proof.

| Candidate | Finding | Decision |
| --- | --- | --- |
| [Causal Band-SCNet](https://www.isca-archive.org/interspeech_2025/yang25d_interspeech.html) | Promising small causal architecture and native CPU measurements, but no author-provided licensed weights or reproducible ONNX artifact found. | Research only |
| [HS-TasNet-Small](https://www.l-acoustics.com/wp-content/uploads/2024/04/real_time_demixer_2024_04_19.pdf) | Relevant published low-latency design, but no author-provided pretrained ONNX artifact found. | Research only |
| [StemgenRT](https://github.com/sweetspotsoundsystem/stemgen-rt) | Concrete streaming HS-TasNet ONNX implementation, but model files exceed 150 MiB before ORT and lack sufficient weight/training/export and browser-Wasm evidence. | Blocked |
| [xumx-sliCQ](https://github.com/sevagh/xumx-sliCQ) | Smaller ONNX mask model, but custom NSGT preprocessing remains outside the graph and no verified persistent streaming-state/browser path was found. | Blocked |
| [Spleeter ONNX](https://github.com/k2-fsa/sherpa/blob/master/docs/source/onnx/source-separation/models.rst) | Described as offline separation and uses multi-second spectrogram context. It cannot satisfy the causal live contract. | Blocked |

## Approval requirements

The executable validator requires one selected model and rejects incomplete
approval. Evidence includes:

- local artifact path, exact size, SHA-256, package size, license, attribution,
  training-data provenance, and reproducible export revision;
- causal sample rate/channel/frame/hop/latency contract and exact tensor schema;
- current Chrome and Firefox ORT Web Wasm benchmarks with p95 below half of the
  hop duration, bounded memory, and no sustained queue growth;
- licensed objective evaluation and documented listening results.

Until every gate passes, the extension remains bypass/unsupported and contains
no `.onnx` binary. Spleeter, MDX-Net, and HTDemucs may be offline quality
references but are not production live-path defaults.
