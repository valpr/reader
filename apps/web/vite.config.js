import dns from 'dns';
import { readFileSync } from 'fs';
import { sveltekit } from '@sveltejs/kit/vite';

const nodeVersion = Number.parseInt(process.versions.node.match(/^(\d+)\./)?.[1] || '17', 10);

if (nodeVersion < 17) {
  dns.setDefaultResultOrder('verbatim');
}

const webPkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** @type {import('vite').UserConfig} */
const config = {
  plugins: [sveltekit()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(
      process.env.VITE_APP_VERSION || webPkg.version || 'dev'
    ),
    'import.meta.env.VITE_BUILD_COMMIT': JSON.stringify(
      process.env.VITE_BUILD_COMMIT || process.env.GITHUB_SHA || 'unknown'
    )
  },
  ssr: {
    // https://github.com/FortAwesome/Font-Awesome/issues/18677
    noExternal: ['@fortawesome/*', '@popperjs/*']
  }
};

export default config;
