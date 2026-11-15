// 模擬「理解程度不同的玩家」各自的破關機率。
// 用法：node tools/skill.mjs            （加數字可以指定每一級模擬幾局，預設 2000）
//
// 這裡不另外寫規則：每一步都是對 engine 送動作。玩家的「理解程度」用一個數字 q 表示：
// 每次需要判斷的時候，有 q 的機率做對，其餘時候用猜的。需要判斷的地方有：
//   1. 在意的地方：指出哪裡有問題（猜錯會扣電，已經猜錯的選項不會再選）
//   2. 回訊息：選最能安撫對方的那一句
//   3. 拿疑點問人：挑問了會有新東西的對象
//   4. 登入視窗：不理它
//   5. 指認兇手：知不知道是誰、每一格放哪一張疑點、是不是證據夠了才交
//      （被退回的格子不會再放同一張，而且看過那一格的提示後有一半機率直接放對；
//        某一格能放的都試過了，就先回去找東西，拿到新疑點才再交）
// 這些假設都是人為訂的，結果只能拿來比較「相對難度」和找卡關的地方，不是真人數據。

import { loadCase } from '../src/content';
import { createEngine, type Action, type Engine, type GameState } from '../src/engine';
import { concreteActions, correctFields } from '../src/check/simulate';

const LEVELS: { name: string; q: number }[] = [
  { name: '幾乎用猜的', q: 0.2 },
  { name: '看得懂一半', q: 0.4 },
  { name: '普通', q: 0.6 },
  { name: '細心', q: 0.8 },
  { name: '推理老手', q: 0.95 },
];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Run {
  ended: string | null;
  battery: number;
  spotMiss: number;
  rejected: number;
  solvable: boolean;
  premature: boolean;
  steps: number;
}

function playOnce(engine: Engine, seed: number, q: number): Run {
  const { content } = engine;
  const rand = rng(seed);
  const pick = <T,>(list: T[]): T => list[Math.floor(rand() * list.length)];
  const knows = () => rand() < q;
  const ch = content.endings.challenge;
  const sum = (ladder: Record<string, number> | undefined) => Object.values(ladder ?? {}).reduce((x, y) => x + y, 0);

  /** 這一局玩家心裡認定的兇手：有 q 的機率想對，否則四個人裡隨便一個 */
  const accused = knows() ? ch.culprit : pick(ch.suspects);
  const givenTo = pick(ch.recipients);
  /** 指認時每一格已經試過、被退回的疑點 */
  const triedField: Record<string, string[]> = {};
  let accusing = false;
  let toFill: string[] | null = null;
  let lastFilled: Record<string, string> = {};
  /** 被退回、某一格能試的都試過了：手上疑點數量沒變之前先不再交，回去找東西 */
  const gaveUpAt = new Set<number>();
  /** 被退回過的格子（退回時會看到那一格的提示，下一次比較容易放對） */
  const hinted = new Set<string>();

  let s: GameState = engine.start();
  const run: Run = { ended: null, battery: 0, spotMiss: 0, rejected: 0, solvable: false, premature: false, steps: 0 };

  for (let guard = 0; guard < 500 && s.phase !== 'ended'; guard++) {
    const options = concreteActions(engine, s);
    const menu = engine.menu(s);
    const fields = correctFields(content, s);
    if (fields) run.solvable = true;
    let action: Action | null = null;

    const reading = options.filter((a) => ['openApp', 'readThread', 'seeMessages', 'seeItems', 'locate', 'viewImage', 'viewProfile'].includes(a.type));
    const spots = options.filter((a) => a.type === 'spot');
    const replies = options.filter((a) => a.type === 'reply');
    const tests = options.filter((a) => a.type === 'test');
    const prompts = options.filter((a) => a.type === 'answerPrompt');

    if (menu.call) {
      action = pick(options);
    } else if (menu.cover) {
      action = options[0];
    } else {
      // 指認：證據夠了，理解程度越高越快發現可以交；沒事可做了也只能交；程度低的偶爾會太早交
      const form = menu.challenge?.form ?? null;
      if (menu.challenge && form && !s.prompt) {
        const nothingLeft = reading.length + spots.length + replies.length + tests.length === 0;
        if (!accusing) {
          if (fields && !gaveUpAt.has(s.cards.length) && rand() < 0.1 + 0.5 * q) accusing = true;
          else if (nothingLeft) accusing = true;
          else if (!fields && s.cards.length >= 4 && !gaveUpAt.has(s.cards.length) && rand() < 0.01 * (1 - q)) {
            accusing = true;
            run.premature = true;
          }
        }
        if (accusing) {
          if (form.passed) action = { type: 'handOver', givenTo };
          else {
            if (toFill === null) {
              toFill = form.slots.map((x) => x.question);
              lastFilled = {};
            }
            const question = toFill.shift();
            if (question === undefined) {
              action = { type: 'submitChallenge' };
              toFill = null;
            } else if (question === 'who') {
              action = { type: 'fillChallenge', question, answer: accused };
            } else {
              const slot = form.slots.find((x) => x.question === question);
              const tried = triedField[question] ?? [];
              const fresh = (slot?.options ?? []).filter((id) => !tried.includes(id));
              const pool = fresh;
              const right = (ch.fields.find((f) => f.id === question)?.cards ?? []).find((id) => pool.includes(id));
              if (!pool.length) {
                accusing = false;
                toFill = null;
                gaveUpAt.add(s.cards.length);
              } else {
                const sure = knows() || (hinted.has(question) && rand() < 0.5);
                const answer = right && sure ? right : pick(pool);
                lastFilled[question] = answer;
                action = { type: 'fillChallenge', question, answer };
              }
            }
          }
        }
      }

      if (!action) {
        if (prompts.length && rand() < 0.8) {
          // 登入視窗：看得懂的人不理它，看不懂的隨便按
          action = knows() ? prompts.find((a) => a.type === 'answerPrompt' && a.option === null)! : pick(prompts);
        } else if (replies.length && rand() < 0.75) {
          // 回訊息：看得懂的人挑最能安撫的那句
          if (knows()) {
            const heat = (a: Action) => {
              if (a.type !== 'reply') return 0;
              const e = content.events.find((x) => x.id === a.event);
              return e?.kind === 'message' ? sum(e.options?.find((o) => o.id === a.option)?.effects?.ladder) : 0;
            };
            action = [...replies].sort((x, y) => heat(x) - heat(y))[0];
          } else action = pick(replies);
        } else if (spots.length && rand() < 0.7) {
          // 在意的地方：先決定看哪一張，再決定指哪裡
          const card = pick(menu.concerns);
          const def = content.cards.find((c) => c.id === card.card);
          const answer = def?.spot?.answer;
          const answers = answer === undefined ? [] : Array.isArray(answer) ? answer : [answer];
          const right = card.options.find((o) => answers.includes(o));
          action = { type: 'spot', card: card.card, option: right && knows() ? right : pick(card.options) };
        } else if (reading.length && rand() < 0.85) {
          action = pick(reading);
        } else if (tests.length) {
          // 拿疑點問人：看得懂的人挑問了會有新東西的
          const useful = tests.filter((a) => {
            if (a.type !== 'test') return false;
            const r = content.reactions.find((x) => x.card === a.card && x.target === a.target && engine.holds(s, x.when));
            return (r?.reveals ?? []).some((id) => !s.seen.includes(id));
          });
          action = useful.length && knows() ? pick(useful) : pick(tests);
        } else if (options.length) {
          action = pick(options);
        } else {
          accusing = true;
          continue;
        }
      }
    }

    const result = engine.step(s, action);
    if (result.state === s) break;
    s = result.state;
    run.steps += 1;
    for (const o of result.outcomes) {
      if (o.kind === 'spot' && !o.right) run.spotMiss += 1;
      if (o.kind === 'challengeRejected') {
        run.rejected += 1;
        for (const f of o.fields) {
          triedField[f] = [...(triedField[f] ?? []), lastFilled[f]].filter(Boolean);
          hinted.add(f);
        }
        toFill = null;
      }
    }
  }
  run.ended = s.ended ?? null;
  run.battery = s.battery;
  return run;
}

export async function main(args: string[]): Promise<number> {
  const total = Number(args[0]) || 2000;
  const content = loadCase('case01');
  const engine = createEngine(content);
  const ch = content.endings.challenge;
  const kind = (id: string | null): string => {
    const e = content.endings.endings.find((x) => x.id === id);
    if (!e) return '沒有結束';
    if (e.trigger.kind === 'battery') return '沒電';
    if (e.trigger.kind === 'ladder') return '被查到醫院';
    if (e.trigger.kind === 'challenge') return e.trigger.accused === ch.culprit ? '破案' : '指錯人';
    return '其他';
  };
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');
  const median = (list: number[]) => (list.length ? [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)] : NaN);
  const mean = (list: number[]) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : NaN);

  console.log(`每一級模擬 ${total} 局。q 是「每次判斷做對的機率」。\n`);
  console.log('| 理解程度 | q | 破案 | 指錯人 | 沒電 | 被查到醫院 | 沒有結束 | 證據曾經湊齊 | 太早交卷 | 破案時剩餘電量（中位數） | 指錯在意的地方（平均次數） | 交卷被退回（平均次數） |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const level of LEVELS) {
    const runs: Run[] = [];
    for (let i = 0; i < total; i++) runs.push(playOnce(engine, i + 1, level.q));
    const count = (k: string) => runs.filter((r) => kind(r.ended) === k).length;
    const solved = runs.filter((r) => kind(r.ended) === '破案');
    console.log(
      `| ${level.name} | ${level.q} | ${pct(count('破案'), total)} | ${pct(count('指錯人'), total)} | ${pct(count('沒電'), total)} | ${pct(count('被查到醫院'), total)} | ${pct(count('沒有結束'), total)} | ${pct(runs.filter((r) => r.solvable).length, total)} | ${pct(runs.filter((r) => r.premature).length, total)} | ${Number.isNaN(median(solved.map((r) => r.battery))) ? '—' : `${Math.round(median(solved.map((r) => r.battery)))}%`} | ${mean(runs.map((r) => r.spotMiss)).toFixed(1)} | ${mean(runs.map((r) => r.rejected)).toFixed(1)} |`,
    );
  }
  return 0;
}
