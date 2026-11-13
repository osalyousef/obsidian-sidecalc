import esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';

const stub = fileURLToPath(new URL('./obsidian-stub.ts', import.meta.url));
await esbuild.build({
	entryPoints: ['preview/preview.ts'],
	bundle: true,
	format: 'esm',
	target: 'es2021',
	outfile: 'preview/dist/preview.js',
	sourcemap: 'inline',
	plugins: [{
		name: 'obsidian-stub',
		setup(b) { b.onResolve({ filter: /^obsidian$/ }, () => ({ path: stub })); },
	}],
	logLevel: 'info',
});
// Preview: python3 -m http.server 8765 --bind 127.0.0.1, then open
// http://127.0.0.1:8765/preview/index.html?scene=demo|graphs|layers
// or run preview/shot.sh <scene> out.png for a headless screenshot.
