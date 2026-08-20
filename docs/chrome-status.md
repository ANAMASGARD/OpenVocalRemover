# Chrome status

Chrome remains a maintained local build target, not a store-ready release.

Verified automatically:

- `npm run build` writes only to `dist/chrome/`;
- the manifest uses a Chrome MV3 module service worker;
- permissions and content-script matches remain limited to YouTube watch pages;
- the processing host, AudioWorklet, worker, local ORT Wasm pair, CSP, and
  fail-open protocols are built from the shared codebase;
- no ONNX model is bundled while `selectedModelId` is `null`.

Not yet verified:

- a causal model meeting the Chrome browser-Wasm performance and quality gate;
- real YouTube capture, activation, A/V synchronization, navigation, ads,
  seek, worker failure, and deadline behavior in a clean Chrome profile;
- Chrome Web Store policy, package, listing, privacy, and reviewer requirements;
- WebGPU acceleration, which remains explicitly deferred and optional.

For local development run `npm run dev` and load `dist/chrome/`. For a static
production build run `npm run build`; it does not depend on the HMR server.
Chrome and Firefox HMR testing requires two terminals because their builds use
different manifests, output directories, and ports.
