// 完整的模擬檢查在 npm run validate 跑（要幾十秒）；這裡只用一兩局測檢查本身會不會抓到錯。
import { describe, expect, it } from 'vitest';
import { loadCase } from '../content';
import { runChecks } from './simulate';

const SCREEN_OFF = '結局的斷電段落（screenOff）都對得上內文';

describe('模擬檢查本身', () => {
  it('斷電段落對不上結局內文時會報錯，對得上就不報', () => {
    const content = loadCase('case01');
    const ok = runChecks(content, { runs: 1 }).checks.find((c) => c.name === SCREEN_OFF)!;
    expect(ok.detail).toEqual([]);

    const copy = structuredClone(content);
    const ending = copy.endings.endings[0];
    ending.screenOff = ending.text[0] + '（改過）';
    const bad = runChecks(copy, { runs: 1 }).checks.find((c) => c.name === SCREEN_OFF)!;
    expect(bad.ok).toBe(false);
    expect(bad.detail).toHaveLength(1);
    expect(bad.detail[0]).toContain(ending.id);
  });

  it('結局的對話段落：格式對的不報；段末多句號、名字打錯會報', () => {
    const NAME = '結局的對話段落格式正確（名字：「……」）';
    const content = loadCase('case01');
    const copy = structuredClone(content);
    const someone = copy.characters[0].name;
    copy.endings.endings[0].text.push(`你：「好。」`, `${someone}：「嗯。」「走吧。」`);
    expect(runChecks(copy, { runs: 1 }).checks.find((c) => c.name === NAME)!.detail).toEqual([]);
    copy.endings.endings[0].text.push(`${someone}：「嗯。」。`, `不存在的人：「嗯。」`);
    const bad = runChecks(copy, { runs: 1 }).checks.find((c) => c.name === NAME)!;
    expect(bad.ok).toBe(false);
    expect(bad.detail).toHaveLength(2);
  });
});
