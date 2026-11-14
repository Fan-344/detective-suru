// 文字冒險版的終端機入口。
//
// 互動模式：npm run play            （加 -- --debug 會顯示階梯等級的變化）
//   列出可做的事、輸入編號執行、印出結果和剩餘電量。輸入 q 離開。
//
// 一次走一步的模式（給「用對話試玩」用，由另一個程式或對話代為操作）：
//   npm run play -- --save <存檔路徑> --new          開新局，印出開場和選項
//   npm run play -- --save <存檔路徑> --choose 3     選第 3 項，印出結果和新的選項
//   npm run play -- --save <存檔路徑>                只重印目前的選項
//   存檔只記「選過哪些編號」。規則是固定的，照著重走一遍就回到同一個狀態。
//
// 重播：npm run play -- --replay <存檔路徑>
//   把存檔從頭重走，印出每一步選了什麼、看到什麼（含階梯變化）。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { loadCase } from '../src/content';
import { TextGame } from '../src/play/textgame';

const valueOf = (args: string[], flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

function print(game: TextGame) {
  for (const line of game.flush()) console.log(line);
  console.log(`\n［電量 ${game.battery}%］`);
  game.choices().forEach((c, i) => console.log(`  ${i + 1}. ${c.label}`));
}

function stepMode(args: string[], save: string, debug: boolean): number {
  const game = new TextGame(loadCase('case01'), { debug });
  let moves: number[] = [];
  if (!args.includes('--new') && existsSync(save)) moves = JSON.parse(readFileSync(save, 'utf8')) as number[];
  for (const m of moves) game.choose(m);
  // 之前的輸出已經看過了，只留開新局時的開場
  if (moves.length > 0) game.flush();

  const choose = valueOf(args, '--choose');
  if (choose !== undefined) {
    const index = Number(choose) - 1;
    if (!Number.isInteger(index) || !game.choose(index)) {
      console.log(`沒有第 ${choose} 項。目前的選項：`);
      print(game);
      return 1;
    }
    moves.push(index);
  }
  mkdirSync(dirname(save), { recursive: true });
  writeFileSync(save, JSON.stringify(moves));
  print(game);
  return 0;
}

/** 把一份存檔從頭重走一遍，印出每一步選了什麼、看到什麼。檢討試玩紀錄用。 */
function replay(path: string): number {
  const content = loadCase('case01');
  const game = new TextGame(content, { debug: true });
  const moves = JSON.parse(readFileSync(path, 'utf8')) as number[];
  for (const line of game.flush()) console.log(line);
  moves.forEach((m, i) => {
    const choices = game.choices();
    console.log(`\n▶ 第 ${i + 1} 步［電量 ${game.battery}%］選「${choices[m]?.label ?? `？（沒有第 ${m + 1} 項）`}」（當時有 ${choices.length} 個選項：${choices.map((c) => c.label).join('｜')}）`);
    if (!game.choose(m)) return;
    for (const line of game.flush()) console.log(line);
  });
  console.log(`\n［結束時電量 ${game.battery}%］`);
  game.choices().forEach((c, i) => console.log(`  ${i + 1}. ${c.label}`));
  return 0;
}

export async function main(args: string[]): Promise<number> {
  const debug = args.includes('--debug');
  const replayPath = valueOf(args, '--replay');
  if (replayPath) return replay(replayPath);
  const save = valueOf(args, '--save');
  if (save) return stepMode(args, save, debug);

  const game = new TextGame(loadCase('case01'), { debug });
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const show = () => {
    print(game);
    rl.setPrompt('> ');
    rl.prompt();
  };

  show();
  for await (const line of rl) {
    const answer = line.trim();
    if (answer === 'q') break;
    const index = Number(answer) - 1;
    if (answer === '' || !Number.isInteger(index) || !game.choose(index)) console.log('請輸入選項前面的編號（輸入 q 離開）。');
    else console.log('');
    show();
  }
  rl.close();
  return 0;
}
