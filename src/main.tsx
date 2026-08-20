async function startExtensionPage(): Promise<void> {
  const context = new URLSearchParams(window.location.search).get('context')
  if (context === 'processing-host') {
    const { startProcessingHostPage } = await import('./processing-host/page.ts')
    startProcessingHostPage()
    return
  }

  const { mountPopup } = await import('./popup/mount.tsx')
  mountPopup()
}

void startExtensionPage()
