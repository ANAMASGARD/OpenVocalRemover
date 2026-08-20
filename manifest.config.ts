import { defineManifest } from '@crxjs/vite-plugin'

const BACKGROUND_ENTRY = 'src/background/index.ts'

export default defineManifest((env) => {
  const isFirefox = env.mode === 'firefox'

  return {
    manifest_version: 3,
    name: 'Open Vocal Remover',
    short_name: 'Open Vocal Remover',
    version: '0.1.0',
    description: 'A privacy-conscious foundation for future vocal-removal tools.',
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    action: {
      default_icon: {
        16: 'icons/icon-16.png',
        32: 'icons/icon-32.png',
        48: 'icons/icon-48.png',
        128: 'icons/icon-128.png',
      },
      default_popup: 'index.html',
      default_title: 'Open Vocal Remover',
    },
    // Chrome MV3 uses service_worker; Firefox MV3 uses scripts. CRXJS's Firefox
    // background loader reads scripts[0], so the source shape must match the target.
    background: isFirefox
      ? {
          scripts: [BACKGROUND_ENTRY],
        }
      : {
          service_worker: BACKGROUND_ENTRY,
          type: 'module',
        },
    permissions: ['activeTab', 'storage'],
    host_permissions: ['https://www.youtube.com/watch*'],
    content_scripts: [
      {
        matches: ['https://www.youtube.com/watch*'],
        js: ['src/content/index.ts'],
        run_at: 'document_idle',
      },
    ],
    web_accessible_resources: [
      {
        resources: ['index.html'],
        matches: ['https://www.youtube.com/*'],
      },
    ],
    browser_specific_settings: {
      gecko: {
        id: 'open-vocal-remover@extension.local',
        data_collection_permissions: { required: ['none'] as Array<'none'> },
      },
    },
  }
})
