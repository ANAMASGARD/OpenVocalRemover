export type BrowserTarget = 'chrome' | 'firefox'

export function getBrowserTarget(mode: string): BrowserTarget {
  return mode === 'firefox' ? 'firefox' : 'chrome'
}

export function getBuildOutputDir(target: BrowserTarget): string {
  return `dist/${target}`
}
