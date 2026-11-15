// 在終端機執行 tools/ 底下的 TypeScript 工具。
// 用法：node tools/skill.mjs [每級局數]
//
// 內容載入器（src/content）用了 Vite 才有的寫法，Node 不能直接跑，
// 所以這裡借用專案已經裝好的 Vite 來載入，不需要另外加套件。

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [tool, ...args] = ["skill", ...process.argv.slice(2)];
if (!['skill'].includes(tool)) {
  console.error('用法：node tools/run.mjs skill');
  process.exit(2);
}

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});

let code = 0;
try {
  const mod = await server.ssrLoadModule(`/tools/${tool}.ts`);
  code = (await mod.main(args)) ?? 0;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  code = 1;
} finally {
  await server.close();
}
process.exit(code);
