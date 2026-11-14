// 文字冒險版的網頁入口（play.html）。只負責把文字印出來、把選項變成按鈕。
// 給朋友試玩用，跟手機外觀框架（src/ui）無關。

import { loadCase } from '../content';
import { TextGame } from './textgame';

const log = document.getElementById('log')!;
const choices = document.getElementById('choices')!;
const battery = document.getElementById('battery')!;

const debug = new URLSearchParams(location.search).has('debug');
const game = new TextGame(loadCase('case01'), { debug });

function refresh() {
  for (const line of game.flush()) {
    const p = document.createElement('p');
    p.textContent = line || ' ';
    if (line.startsWith('　〔') || line.startsWith('　＋')) p.className = 'dim';
    log.appendChild(p);
  }
  battery.textContent = `電量 ${game.battery}%`;
  choices.replaceChildren(
    ...game.choices().map((choice, i) => {
      const button = document.createElement('button');
      button.textContent = `${i + 1}. ${choice.label}`;
      button.addEventListener('click', () => {
        const echo = document.createElement('p');
        echo.className = 'echo';
        echo.textContent = `▶ ${choice.label}`;
        log.appendChild(echo);
        game.choose(i);
        refresh();
      });
      return button;
    }),
  );
  log.scrollTop = log.scrollHeight;
}

refresh();
