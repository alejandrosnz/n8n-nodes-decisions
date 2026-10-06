import { defineConfig } from 'vitest/config';

export default defineConfig({
	logLevel: 'error',
	test: {
		coverage: {
			reporter: ['text', 'json-summary', 'html'],
		},
	},
});
