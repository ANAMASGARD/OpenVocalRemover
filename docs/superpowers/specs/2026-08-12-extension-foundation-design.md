# Open Vocal Remover Extension Foundation

## Goal

Create a maintainable, cross-browser browser-extension foundation for Open Vocal Remover. The foundation must load in Chrome and Firefox, while deliberately deferring all vocal-removal behavior until it is specified.

## Architecture

The project uses TypeScript, React, Vite, and CRXJS with a Manifest V3 source manifest. The only active extension surface is an accessible popup. Shared modules provide constants and a small platform boundary; content and background locations exist as documented future boundaries but are not registered or bundled as extension entry points.

The manifest has no permissions or host permissions. It declares a stable Firefox Gecko ID, `open-vocal-remover@extension.local`, and Firefox's no-data-collected declaration. Chrome ignores the Firefox-specific manifest metadata.

## User experience

The popup is a small foundation-ready screen, not a fictional implementation of the product. It identifies the extension and clearly says that vocal-removal tools will be added in a later milestone. It uses local CSS, keyboard-safe markup, and an explicit accessible landmark.

## Verification

The repository provides type checking, linting, a manifest-shape test, and a production build. The README documents loading the built extension in Chrome and Firefox, plus the temporary Firefox development workflow.
