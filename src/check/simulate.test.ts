import { describe, expect, it } from 'vitest';
import { loadCase } from '../content';
import { runChecks } from './simulate';

describe('自動模擬檢查', () => {
  it('case01：結論到得了、結局觸發得了、沒有死路', () => {
    const { checks } = runChecks(loadCase('case01'), { runs: 2800 });
    for (const c of checks) expect(c.detail, c.name).toEqual([]);
    // 模擬幾千局要好幾秒，時間上限放寬
  }, 60_000);
});
