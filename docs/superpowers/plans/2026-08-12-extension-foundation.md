# Open Vocal Remover Extension Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript React browser-extension foundation that is loadable in Chrome and Firefox without implementing product behavior.

**Architecture:** CRXJS compiles a typed Manifest V3 source and React popup into the extension output. Shared code owns metadata and platform access, while content and background folders are documented but inactive until a feature requires them.

**Tech Stack:** TypeScript, React 19, Vite 8, CRXJS 2.7, ESLint, Vitest.

---

### Task 1: Establish typed extension configuration

**Files:**
- Create: `tsconfig.json`
- Create: `manifest.config.ts`
- Modify: `vite.config.ts`
- Modify: `package.json`

- [x] Add TypeScript, React type declarations, CRXJS manifest configuration, and `typecheck`/`test` npm scripts.
- [x] Define Manifest V3 metadata, a popup action, no permissions, local icon resources, and Firefox's stable ID/data-collection declaration.
- [x] Run `npm run typecheck` and `npm run build`; both exit successfully and build `dist/manifest.json`.

### Task 2: Replace the starter UI with the popup boundary

**Files:**
- Create: `src/popup/PopupApp.tsx`
- Create: `src/popup/popup.css`
- Create: `src/shared/extension.ts`
- Create: `src/platform/browser.ts`
- Modify: `src/main.tsx`
- Modify: `src/index.css`

- [x] Implement an accessible, minimal foundation-ready popup driven by shared metadata.
- [x] Make the platform module expose only the resolved extension API namespace for future use; do not invoke privileged APIs.
- [x] Run `npm run lint` and `npm run typecheck`; both exit successfully.

### Task 3: Add regression checks and contributor documentation

**Files:**
- Create: `src/manifest.test.ts`
- Modify: `README.md`
- Modify: `eslint.config.js`

- [x] Verify the manifest's identity, popup, permissions, and Firefox release metadata in Vitest.
- [x] Document local development, production builds, and Chrome/Firefox loading procedures.
- [x] Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`; all commands exit successfully.
