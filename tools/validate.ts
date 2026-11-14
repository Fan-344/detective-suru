// 內容檢查：自動模擬各種玩法，確認每個關鍵結論到得了、每個結局觸發得了、沒有死路。
// 用法：npm run validate          （加 -- 20000 可以指定模擬幾局）
// 檢查的內容在 src/check/simulate.ts。

import { loadCase } from '../src/content';
import { runChecks } from '../src/check/simulate';

export async function main(args: string[]): Promise<number> {
  const runs = Number(args[0]) || undefined;
  const { checks, report } = runChecks(loadCase('case01'), { runs });
  for (const c of checks) {
    console.log(`${c.ok ? '✓' : '✗'} ${c.name}`);
    for (const line of c.detail) console.log(`    ${line}`);
  }
  console.log('\n── 數值觀察（不算通過或失敗）──');
  for (const line of report) console.log(line);
  const failed = checks.filter((c) => !c.ok).length;
  console.log(failed ? `\n${failed} 項沒過。` : '\n全部通過。');
  return failed ? 1 : 0;
}
