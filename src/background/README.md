# Background context

`src/background/index.ts` is the minimal MV3 background entry used to establish
browser-specific build output:

- Chrome: `background.service_worker`
- Firefox: `background.scripts`

It intentionally has no feature behavior yet. Later plan steps attach validated
runtime messaging here through `src/platform/browser.ts`.
