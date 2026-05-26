import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		root: './src',
		include: ['**/*.spec.ts'],
		setupFiles: ['./vitest.setup.ts'],
	},
	plugins: [swc.vite()],
});
