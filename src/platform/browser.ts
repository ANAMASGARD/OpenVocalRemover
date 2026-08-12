/** Returns the browser's portable WebExtensions namespace. */
export function getExtensionApi(): typeof chrome {
  if (!globalThis.chrome?.runtime) {
    throw new Error('The WebExtensions API is unavailable outside an extension context.')
  }

  return globalThis.chrome
}
