/** Narrow YouTube watch-page detection and an inactive video lifecycle. */

export type YouTubeWatchLocation = Pick<Location, 'hostname' | 'pathname'>

export type VideoFinder = () => HTMLVideoElement | undefined
export type VideoSelectionListener = (video: HTMLVideoElement | undefined) => void

/** The current release supports only the canonical YouTube watch route. */
export function isSupportedYouTubeWatchLocation(location: YouTubeWatchLocation): boolean {
  return location.hostname === 'www.youtube.com' && location.pathname === '/watch'
}

/** Returns YouTube's main media element, not an arbitrary page video. */
export function findYouTubeWatchVideo(
  root: Pick<ParentNode, 'querySelector'>,
): HTMLVideoElement | undefined {
  return root.querySelector<HTMLVideoElement>('video.html5-main-video') ?? undefined
}

/**
 * Tracks one selected YouTube video while processing is explicitly enabled.
 * It deliberately owns no AudioContext; the later media controller subscribes
 * to selection changes through this small, idempotent seam.
 */
export class YouTubeVideoLifecycle {
  private enabled = false
  private selectedVideo: HTMLVideoElement | undefined

  constructor(
    private readonly findVideo: VideoFinder,
    private readonly onVideoSelection: VideoSelectionListener,
  ) {}

  enable(): void {
    if (this.enabled) {
      return
    }

    this.enabled = true
    this.attach()
  }

  disable(): void {
    if (!this.enabled) {
      return
    }

    this.enabled = false
    this.detach()
  }

  /** Re-checks the selected media after a YouTube SPA or DOM change. */
  synchronise(): void {
    this.attach()
  }

  /** Selects the current video once, but only after explicit enablement. */
  attach(): void {
    if (!this.enabled) {
      return
    }

    const nextVideo = this.findVideo()
    if (nextVideo === this.selectedVideo) {
      return
    }

    this.detach()
    if (nextVideo !== undefined) {
      this.selectedVideo = nextVideo
      this.onVideoSelection(nextVideo)
    }
  }

  /** Clears a previous selection exactly once. */
  detach(): void {
    if (this.selectedVideo === undefined) {
      return
    }

    this.selectedVideo = undefined
    this.onVideoSelection(undefined)
  }
}
