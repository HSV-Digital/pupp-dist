import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const monorepoRoot = path.resolve(__dirname, '../..');

export default defineConfig({
	plugins: [react()],
	test: {
		environment: 'jsdom',
		globals: true,
		setupFiles: ['./src/setupTests.ts'],
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
			react: path.resolve(monorepoRoot, 'node_modules/react'),
			'react-dom': path.resolve(monorepoRoot, 'node_modules/react-dom'),
		},
	},
});
