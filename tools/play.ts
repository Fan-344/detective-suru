// 文字冒險版的終端機入口。
// 用法：npm run play            （加 -- --debug 會顯示階梯等級的變化）
// 列出可做的事、輸入編號執行、印出結果和剩餘電量。輸入 q 離開。

import { createInterface } from 'node:readline';
import { loadCase } from '../src/content';
import { TextGame } from '../src/play/textgame';

export async function main(args: string[]): Promise<number> {
  const game = new TextGame(loadCase('case01'), { debug: args.includes('--debug') });
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const show = () => {
    for (const line of game.flush()) console.log(line);
    console.log(`\n［電量 ${game.battery}%］`);
    game.choices().forEach((c, i) => console.log(`  ${i + 1}. ${c.label}`));
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
