import { ContentProcessingController } from './controller.ts'
import modelLockJson from '../../models/model-lock.json'
import { resolveSelectedModel } from '../inference/runtime-model.ts'
import { getExtensionApi } from '../platform/browser.ts'
import { parsePopupCommand } from '../shared/protocol.ts'
import {
  findYouTubeWatchVideo,
  isSupportedYouTubeWatchLocation,
  YouTubeVideoLifecycle,
} from './youtube.ts'
import { createRealtimePipelineDescriptor } from './audio-pipeline.ts'

function startYouTubeWatchLifecycle(): void {
  if (!isSupportedYouTubeWatchLocation(window.location)) {
    return
  }

  const lifecycle = new YouTubeVideoLifecycle(
    () => findYouTubeWatchVideo(document),
    // Capture remains unclaimed until the explicit two-browser probe passes.
    () => undefined,
  )
  // Capture remains behind the explicit two-browser manual gate. Keeping the
  // worklet URL in this descriptor makes the compiled local module available
  // without allowing the controller to claim media prematurely.
  const pipeline = createRealtimePipelineDescriptor(
    resolveSelectedModel(modelLockJson),
    'unverified',
  )
  const controller = new ContentProcessingController(lifecycle, pipeline.availability)

  let synchroniseScheduled = false
  const scheduleSynchronise = (): void => {
    if (synchroniseScheduled) {
      return
    }

    synchroniseScheduled = true
    queueMicrotask(() => {
      synchroniseScheduled = false
      lifecycle.synchronise()
    })
  }

  window.addEventListener('yt-navigate-finish', scheduleSynchronise)
  window.addEventListener('popstate', scheduleSynchronise)

  const observer = new MutationObserver(scheduleSynchronise)
  observer.observe(document.documentElement, { childList: true, subtree: true })

  window.addEventListener(
    'pagehide',
    () => {
      observer.disconnect()
      lifecycle.disable()
    },
    { once: true },
  )

  getExtensionApi().runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      sendResponse(controller.handlePopupCommand(parsePopupCommand(message)))
    } catch {
      // Do not expose untrusted payloads or page data in diagnostics.
      sendResponse({
        type: 'processing-status',
        state: 'failed',
        enabled: false,
        reason: 'invalid-command',
        model: null,
        backend: null,
        bufferedLatencyMs: null,
      })
    }
  })
}

startYouTubeWatchLifecycle()
