# Model approval lock

`model-lock.json` is the source of truth for production model selection. The
current `selectedModelId` is `null`: no reviewed artifact satisfies the causal,
licensing, package-size, quality, and browser-Wasm gates.

A model may be marked `approved` only when `validateModelLock` accepts its full
record and the referenced local artifact and evidence files are present. Model
binaries belong under `public/models/<model-id>/`; research candidates do not.

The extension must remain truthful bypass/unsupported while no model is
selected. Do not add a remote download fallback.
