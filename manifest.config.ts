import { defineManifest } from '@crxjs/vite-plugin'

export const manifest = {
  manifest_version: 3 as const,
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
  permissions: [],
  host_permissions: [],
  browser_specific_settings: {
    gecko: {
      id: 'open-vocal-remover@extension.local',
      data_collection_permissions: { required: ['none'] as Array<'none'> },
    },
  },
}

export default defineManifest(manifest)
