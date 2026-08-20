import { describe, expect, it, vi } from 'vitest'
import {
  YouTubeVideoLifecycle,
  findYouTubeWatchVideo,
  isSupportedYouTubeWatchLocation,
} from './youtube.ts'

describe('YouTube watch-page detection', () => {
  it('accepts only the supported YouTube watch route', () => {
    expect(
      isSupportedYouTubeWatchLocation({ hostname: 'www.youtube.com', pathname: '/watch' }),
    ).toBe(true)
    expect(
      isSupportedYouTubeWatchLocation({ hostname: 'www.youtube.com', pathname: '/results' }),
    ).toBe(false)
    expect(
      isSupportedYouTubeWatchLocation({ hostname: 'music.youtube.com', pathname: '/watch' }),
    ).toBe(false)
  })

  it('selects YouTube’s main HTML video element only', () => {
    const video = {} as HTMLVideoElement
    const querySelector = vi.fn().mockReturnValue(video)

    expect(findYouTubeWatchVideo({ querySelector })).toBe(video)
    expect(querySelector).toHaveBeenCalledWith('video.html5-main-video')
  })
})

describe('YouTube video lifecycle', () => {
  it('stays inactive until enabled and replaces a selected video without duplicates', () => {
    const firstVideo = {} as HTMLVideoElement
    const secondVideo = {} as HTMLVideoElement
    const findVideo = vi.fn(() => firstVideo)
    const selected: Array<HTMLVideoElement | undefined> = []
    const lifecycle = new YouTubeVideoLifecycle(findVideo, (video) => selected.push(video))

    lifecycle.synchronise()
    expect(selected).toEqual([])

    lifecycle.enable()
    lifecycle.enable()
    expect(selected).toEqual([firstVideo])

    findVideo.mockReturnValue(secondVideo)
    lifecycle.synchronise()
    expect(selected).toEqual([firstVideo, undefined, secondVideo])

    lifecycle.disable()
    lifecycle.disable()
    expect(selected).toEqual([firstVideo, undefined, secondVideo, undefined])
  })
})
