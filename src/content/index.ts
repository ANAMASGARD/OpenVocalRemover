import { ContentProcessingController } from './controller.ts'
import { getExtensionApi } from '../platform/browser.ts'
import { parsePopupCommand } from '../shared/protocol.ts'
import {
  findYouTubeWatchVideo,
  isSupportedYouTubeWatchLocation,
  YouTubeVideoLifecycle,
} from './youtube.ts'

function startYouTubeWatchLifecycle(): void {
  if (!isSupportedYouTubeWatchLocation(window.location)) {
    return
  }

  const lifecycle = new YouTubeVideoLifecycle(
    () => findYouTubeWatchVideo(document),
    // Selection has no audio side effects until the media controller is added.
    () => undefined,
  )
  const controller = new ContentProcessingController(lifecycle)

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
        state: 'error',
        reason: 'Invalid extension command.',
      })
    }
  })
}

startYouTubeWatchLifecycle()
