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
			// Pre dev je base prázdna; v produkcii na GitHub Pages sa pridá názov repozitára.
			base: process.argv.includes('dev') ? '' : '/gin-darts-scoring-sveltekit'
		}
	}
};

export default config;
