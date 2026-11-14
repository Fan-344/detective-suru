import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true },
  preview: { host: true },
  // 兩個入口：index.html 是手機畫面，play.html 是文字試玩版
  build: { rollupOptions: { input: { main: 'index.html', play: 'play.html' } } },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
});
