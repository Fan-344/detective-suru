import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true },
  preview: { host: true },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
});
