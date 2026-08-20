# Firefox packaging and AMO submission

Status: **release blocked** until one causal model is approved and the complete
clean-profile Firefox checklist passes. The commands below are ready; they do
not turn the current no-model build into a functional vocal-removal release.

## Local package verification

Use Node 24.14+ and npm 11.9+ within their documented major versions:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run package:firefox:preview
npm run smoke:firefox
npm run package:source
```

The preview command rebuilds `dist/firefox/`, validates the root manifest,
stable Gecko ID, no-data declaration, narrow permissions, Firefox background,
model lock, ONNX Runtime assets, licences, archive paths, and AMO's 200 MB size
limit. It writes the preview ZIP and SHA-256 file under `artifacts/`.

The source command creates a separate readable-source ZIP and checksum. Its
explicit allowlist excludes `.git`, `node_modules`, `dist`, `artifacts`, local
benchmark traces, and unrelated untracked files.

The smoke command uses a clean temporary Firefox profile and Firefox's local
WebDriver BiDi endpoint to install the preview package temporarily, verify its
stable extension ID, uninstall it, and close the profile. It binds only to
loopback and does not navigate to YouTube. This proves package installation,
not audio capture, inference quality, or live playback behavior.

## Production gate

After a model and its evidence are approved, record the manual checks described
in `docs/release-checklist.md`, then run:

```bash
npm run package:firefox -- --evidence docs/benchmarks/<manual-evidence>.json
```

This command fails closed if the model is not approved, evidence is missing,
any check is not `passed`, or evidence names another model. Do not rename a
preview package or bypass this gate.

## AMO submission

1. Re-check the official Mozilla requirements linked from
   `docs/amo-policy-research.md`.
2. Upload the production Firefox ZIP to AMO. The archive has `manifest.json` at
   its root and must remain below 200 MB.
3. Declare that the Vite/CRXJS build requires source submission and upload the
   separately generated source ZIP for the same version.
4. In reviewer notes, provide the exact test procedure, ONNX Runtime release
   and source links, selected-model provenance/licence/checksum, local asset
   paths, and the local-only/no-data behavior.
5. Resolve every validator error and security/privacy warning. Automated
   validation or signing does not guarantee later human-review approval.
6. Download and test Mozilla's signed artifact before distributing it.

No command in this repository uploads to AMO or stores AMO credentials.
