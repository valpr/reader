import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Valpr Reader',
  description:
    'Documentation, user guides, settings reference, and troubleshooting for Valpr Reader (enhanced ッツ Reader)',
  base: process.env.DOCS_BASE_PATH || '/',
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    logo: '/favicon.png',
    siteTitle: 'Valpr Reader Docs',
    search: {
      provider: 'local'
    },
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Differences from ttsu', link: '/guide/differences-from-ttsu' },
      { text: 'Profiles', link: '/guide/reader-profiles' },
      { text: 'Extensions', link: '/extensions/yomitan' },
      { text: 'Settings', link: '/settings/reader-settings' },
      { text: 'Troubleshooting', link: '/troubleshooting/dictionary-popup' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Overview & Installation', link: '/guide/getting-started' },
            { text: 'Differences from Native ttsu', link: '/guide/differences-from-ttsu' },
            { text: 'Reader Device Profiles', link: '/guide/reader-profiles' }
          ]
        },
        {
          text: 'Core Features',
          items: [
            { text: 'Cloud Sync (Drive & OneDrive)', link: '/features/cloud-sync' },
            { text: 'Reading Statistics & Lookback', link: '/features/lookback-stats' },
            { text: 'Checkpoints & Rolling Autosave', link: '/features/checkpoints-autosave' }
          ]
        }
      ],
      '/features/': [
        {
          text: 'Core Features',
          items: [
            { text: 'Cloud Sync (Drive & OneDrive)', link: '/features/cloud-sync' },
            { text: 'Reading Statistics & Lookback', link: '/features/lookback-stats' },
            { text: 'Checkpoints & Rolling Autosave', link: '/features/checkpoints-autosave' }
          ]
        },
        {
          text: 'Guides',
          items: [
            { text: 'Differences from Native ttsu', link: '/guide/differences-from-ttsu' },
            { text: 'Reader Device Profiles', link: '/guide/reader-profiles' }
          ]
        }
      ],
      '/extensions/': [
        {
          text: 'Popup Dictionaries',
          items: [
            { text: 'Yomitan Setup & Guide', link: '/extensions/yomitan' },
            { text: 'JPDB Reader Integration', link: '/extensions/jpdb' }
          ]
        },
        {
          text: 'Troubleshooting',
          items: [{ text: 'Dictionary Popup Detection', link: '/troubleshooting/dictionary-popup' }]
        }
      ],
      '/settings/': [
        {
          text: 'Settings Reference',
          items: [
            { text: 'Reader Settings', link: '/settings/reader-settings' },
            { text: 'Data & Storage Settings', link: '/settings/data-storage' },
            { text: 'Statistics & Tracker Settings', link: '/settings/statistics' }
          ]
        }
      ],
      '/troubleshooting/': [
        {
          text: 'Troubleshooting',
          items: [{ text: 'Dictionary Popup Detection', link: '/troubleshooting/dictionary-popup' }]
        },
        {
          text: 'Extensions',
          items: [
            { text: 'Yomitan Setup & Guide', link: '/extensions/yomitan' },
            { text: 'JPDB Reader Integration', link: '/extensions/jpdb' }
          ]
        }
      ]
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/valpr/reader' }],
    footer: {
      message: 'Released under the BSD-3-Clause License.',
      copyright: 'Valpr Reader Documentation'
    }
  }
});
