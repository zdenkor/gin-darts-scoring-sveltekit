import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: '404.html',
			precompress: false,
			strict: true
		}),
		paths: {
			// Base path can be overridden via BASE_PATH env var.
			// Examples:
			//   npm run build                    -> /gin-darts-scoring-sveltekit (GitHub Pages default)
			//   BASE_PATH=/app npm run build     -> /app
			//   BASE_PATH='' npm run build       -> '' (root domain / custom server)
			//   npm run dev                      -> '' (localhost)
			base: process.env.BASE_PATH ?? (process.argv.includes('dev') ? '' : '/gin-darts-scoring-sveltekit')
		}
	}
};

export default config;
