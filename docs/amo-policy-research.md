# Firefox/AMO packaging notes for local ONNX Runtime Wasm

Checked against official Mozilla documentation on **2026-08-20**. AMO policy,
validator behavior, and the reviewer build image can change; re-check the linked
pages immediately before each release. This note is engineering guidance, not
legal advice.

## Requirements that apply to this extension

1. **Package the built extension itself.** The upload must be a ZIP/XPI of the
   files *inside* `dist/firefox/`, with `manifest.json` at the archive root—not a
   ZIP containing the `firefox` directory. `web-ext build` is Mozilla's
   recommended packager. The AMO upload limit is 200 MB.
   ([Package your extension](https://extensionworkshop.com/documentation/publish/package-your-extension/),
   [Submitting an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/))

2. **Give Firefox MV3 a stable extension ID and current data declaration.** A
   signed Manifest V3 extension must set `browser_specific_settings.gecko.id`.
   New AMO submissions must also declare
   `browser_specific_settings.gecko.data_collection_permissions`; a genuinely
   local-only build that transmits nothing outside the extension or local
   browser declares `required: ["none"]`.
   ([`browser_specific_settings`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings),
   [Add-on Policies, data transmission](https://extensionworkshop.com/documentation/publish/add-on-policies/#data-collection-and-transmission-disclosure-and-control))

3. **Enable Wasm explicitly in the MV3 extension-page CSP.** Firefox MV3 needs
   `'wasm-unsafe-eval'` in `content_security_policy.extension_pages` to compile
   or instantiate WebAssembly. Keep code local: MV3 permits only `'self'`,
   `'none'`, and `'wasm-unsafe-eval'` for extension-page `script-src` and
   `worker-src`; remote script sources and `'unsafe-eval'` are not allowed.
   `object-src 'self'` is optional in Firefox 106+ but remains useful for older
   Firefox and Chrome compatibility.
   ([MDN `content_security_policy`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_security_policy),
   [MDN extension CSP](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_Security_Policy))

4. **Use a Firefox-compatible MV3 background declaration.** Firefox currently
   runs MV3 background scripts as non-persistent event pages and does not support
   `background.service_worker`; use `background.scripts` in the Firefox build.
   A cross-browser manifest may declare both forms, but this project already
   produces separate browser manifests and should keep the Firefox form narrow.
   ([MDN `background`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background))

5. **Ship inference assets locally and request only necessary access.** AMO
   requires add-ons to be self-contained, forbids loading remote code for
   execution, requires only necessary permissions, discourages redundant files,
   and prohibits harming Firefox performance or stability. For this project,
   package the selected `.onnx` file and required ONNX Runtime `.wasm`/JavaScript
   files in the extension; do not use a CDN or runtime model download.
   ([Add-on Policies, Development Practices](https://extensionworkshop.com/documentation/publish/add-on-policies/#development-practices))

6. **Expose packaged files to web pages only when the runtime path requires
   it.** `web_accessible_resources` is not mandatory. In MV3, exposed entries
   must name the resources and a restricted `matches` or `extension_ids` scope.
   Mozilla recommends exposing as little as possible because web-accessible
   resources bypass normal page CORS/CSP checks. Resolve packaged URLs with
   `runtime.getURL()` rather than constructing a `moz-extension://` URL.
   ([MDN `web_accessible_resources`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/web_accessible_resources))

7. **Use a released, unmodified ONNX Runtime dependency and disclose it.** AMO
   accepts only release versions of third-party libraries/frameworks and does
   not permit manual modifications. Reviewer notes must identify third-party
   libraries with links to the exact released files and their readable source;
   an exact dependency in `package.json` retrieved from the public npm registry
   qualifies as a library link, but direct release-tag links in reviewer notes
   are clearer. Keep `package-lock.json`, do not patch the ONNX Runtime package,
   and ensure copied Wasm bytes come from that locked release.
   ([Third Party Library Usage](https://extensionworkshop.com/documentation/publish/third-party-library-usage/),
   [Add-on Policies, Development Practices](https://extensionworkshop.com/documentation/publish/add-on-policies/#development-practices))

8. **Submit source for every bundled release.** Vite/CRXJS transpiles and
   combines files, so AMO requires the readable pre-build source and exact build
   instructions with every version. Obfuscated code is forbidden; ordinary
   minification, transpilation, and bundling are allowed when reviewers can
   reproduce the submitted package. Dependencies must be included in the source
   archive or downloaded only through their official package manager during the
   build. The source archive limit is 200 MB.
   ([Add-on Policies, Source Code Submission](https://extensionworkshop.com/documentation/publish/add-on-policies/#source-code-submission),
   [Source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/))

9. **Hold redistribution rights for every bundled artifact.** The submitter must
   have the rights needed to use, reproduce, distribute, and authorize Mozilla
   to review and distribute the complete add-on. Confirm the redistribution
   terms independently for ONNX Runtime and, especially, the selected model
   weights; an open-source runtime license does not grant rights to an unrelated
   model.
   ([Firefox Add-on Distribution Agreement](https://extensionworkshop.com/documentation/publish/firefox-add-on-distribution-agreement/))

10. **Provide functional-review information.** The listing must describe only
   behavior that the add-on actually implements. Reviewer notes must explain how
   to activate and test the feature and provide credentials if any are needed.
   ([Add-on Policies, Submission Guidelines](https://extensionworkshop.com/documentation/publish/add-on-policies/#submission-guidelines))

11. **Obtain Mozilla signing for release distribution.** Extensions must be
    signed through AMO before installation in release and Beta Firefox, whether
    listed on AMO or self-distributed. Signing and initial automated validation
    do not remove the possibility of later human review.
    ([Signing and distribution overview](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/))

## Source archive and reviewer build instructions

Create a separate source archive for AMO; do not put it inside the user-facing
extension ZIP. It should contain the repository source needed for the Firefox
build, `package.json`, `package-lock.json`, build configuration, the local model
input and its provenance/license record, and a reviewer README. Exclude `.git`,
`node_modules`, unrelated development artifacts, and secrets.

The reviewer README should pin the actual release environment and include at
least:

```text
Operating system and CPU architecture used for the release build
Exact Node.js and npm versions

npm ci
npm run typecheck
npm run lint
npm test
npm run build:firefox

Built extension directory: dist/firefox/
Archive manifest location: manifest.json at ZIP root
```

State whether the release environment differs from AMO's current default. As of
the check date, Mozilla documents Ubuntu 24.04.4 LTS on ARM64, Node 24.14.0, npm
11.9.0, 10 GB RAM, 6 vCPUs, and 35 GB free disk. Reviewers rebuild and diff the
result against the submitted extension, and Mozilla says there must be no
differences. Build tools must be open source and runnable locally, and the
lockfile must be included.
([Source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/))

In AMO **Notes for Reviewers**, also provide:

- the exact `onnxruntime-web` version, upstream release tag, original distributed
  files, and readable-source links;
- the model name/version, source, redistribution license, SHA-256, and a short
  explanation of its input/output semantics;
- the exact local paths of the `.onnx` and `.wasm` assets in the package;
- confirmation that inference is local and that no audio, model-derived data,
  model, code, telemetry, or analytics is downloaded or uploaded;
- a short, reproducible Firefox test procedure and the expected fail-open
  behavior when the model/backend is unavailable.

## ONNX-model policy uncertainty

Mozilla's published extension policy does **not** specifically classify ONNX
weights or provide a model-file checklist. Therefore:

- It is verified that Wasm/JavaScript runtime code must follow the CSP,
  self-containment, third-party-library, and source-review rules above.
- It is **not verified** that AMO treats an `.onnx` file as third-party library
  code, ordinary data, or another review category.
- Conservatively treat model weights as opaque, behavior-affecting third-party
  material: bundle them locally, document provenance and redistribution rights,
  checksum them, describe their role, and make the exact binary available to the
  reviewer build. This is a risk-reduction recommendation, not a quoted AMO
  requirement.
- No official Mozilla source located during this review says that `.onnx` or
  `.wasm` file extensions are categorically prohibited. Passing automated
  validation still does not guarantee approval; any add-on can receive later
  human review.
  ([Signing and distribution overview](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/),
  [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/))
