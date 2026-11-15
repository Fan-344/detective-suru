// 內容檢查：自動模擬各種玩法，確認每個關鍵結論到得了、每個結局觸發得了、沒有死路。
// 用法：npm run validate                  全部通過只印一行；有沒過的才印細節
//       npm run validate -- --report      另外印數值觀察（破案率、站不住比例等），調整難度或電量時用
//       npm run validate -- 20000         指定模擬幾局（可以和 --report 一起用）
// 檢查的內容在 src/check/simulate.ts。npm test 不跑這個模擬，改程式或劇情結構時要記得跑。

import { loadCase } from '../src/content';
import { runChecks } from '../src/check/simulate';

export async function main(args: string[]): Promise<number> {
  const runs = Number(args.find((a) => /^\d+$/.test(a))) || undefined;
  const showReport = args.includes('--report');
  const started = Date.now();
  const { checks, report, runs: played } = runChecks(loadCase('case01'), { runs });
  const seconds = Math.round((Date.now() - started) / 1000);
  const failed = checks.filter((c) => !c.ok);

  if (failed.length) {
    for (const c of checks) {
      console.log(`${c.ok ? '✓' : '✗'} ${c.name}`);
      for (const line of c.detail) console.log(`    ${line}`);
    }
  }
  if (showReport) {
    console.log('── 數值觀察（不算通過或失敗）──');
    for (const line of report) console.log(line);
    console.log('');
  }
  console.log(
    failed.length
      ? `✗ ${checks.length} 項檢查有 ${failed.length} 項沒過（模擬 ${played} 局，${seconds} 秒）`
      : `✓ ${checks.length} 項檢查全過（模擬 ${played} 局，${seconds} 秒）`,
  );
  return failed.length ? 1 : 0;
}
