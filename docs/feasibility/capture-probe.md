# Cross-browser capture feasibility gate

Status: **automated seam implemented; real YouTube evidence not yet recorded**.

The production audio graph must not claim a YouTube media element until this
gate passes. `MediaElementAudioSourceNode` is required to emit silence for some
CORS-cross-origin resources, and a source node cannot be detached to restore the
browser's native media route. A successful build or fake-node unit test is not
browser evidence.

## Probe procedure

Run the explicit `MediaElementCaptureProbe` from a YouTube-page user gesture in
a development-only harness. For each current desktop browser, record:

1. Browser and OS version.
2. YouTube VOD, live stream, and ad-transition case.
3. `AudioContext` activation result.
4. Whether multiple analyser windows observe a non-zero signal.
5. Whether raw passthrough remains audible and synchronized.
6. Whether a reload restores native audio after a failed or silent probe.

Do not treat a quiet passage as a CORS failure. Test several windows during
known audible playback. Do not use protected media to bypass EME restrictions.

## Release gate

Tasks that define contracts, bounded transport, or model research may proceed
without claiming playback support. Production activation and any stable release
remain blocked until VOD and live-stream capture pass in both Chrome and Firefox,
including original-audio restoration behavior.
