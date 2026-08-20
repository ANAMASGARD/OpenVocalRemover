# Processing-host feasibility gate

Status: **automated protocol/build evidence passes; live iframe/port evidence is
not yet recorded**.

The bounded realtime scheduler, direct worklet endpoint transfer, explicit
capture/output buffer recycling, deadline checks in the AudioContext clock
domain, and fail-open control plane are implemented and covered by deterministic
tests. They are intentionally inactive: `models/model-lock.json` selects no
model, and the two-browser media-capture gate remains unverified. The popup and
content controller must therefore report unsupported without creating an
AudioContext or claiming YouTube media.

The shared Chrome/Firefox design uses `index.html?context=processing-host` as a
hidden extension-origin iframe. A one-shot, 256-bit capability is registered in
the memory-only background broker for the current tab. The host claims it before
creating its module worker. PCM must use the transferred audio `MessagePort`;
runtime messaging is control-only.

Before runtime activation, verify on a YouTube watch page in each browser:

1. The hidden `index.html` frame loads from the extension origin.
2. A wrong origin, wrong tab, wrong token, expired token, and duplicate claim fail.
3. A valid claim creates exactly one local worker and audio endpoint.
4. A sustained echo probe transfers stereo buffers without runtime messaging,
   sequence gaps, queue growth, or external requests.
5. Navigation and close terminate the worker, close ports, and remove the frame.

If YouTube CSP or either browser blocks this topology, stop rather than expose a
broader resource, persist capabilities, or clone PCM through runtime messages.
