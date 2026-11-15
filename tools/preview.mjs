// 把 content/<case>/ 的資料檔排成一份給人讀的文字稿，方便校對文本。
// 用法：node tools/preview.mjs case01
// 輸出：docs/preview/<case>.md（每次重新產生，不要手改）

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const caseId = process.argv[2] ?? 'case01';
const dir = join(root, 'content', caseId);

const read = (name, fallback) => {
  const file = join(dir, `${name}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
};

const meta = read('meta', {});
const characters = read('characters', []);
const apps = read('apps', { apps: [], folders: [] });
const items = read('items', []);
const threads = read('threads', []);

const names = Object.fromEntries(characters.map((c) => [c.id, c.name]));
if (meta.self) names[meta.self.id] = meta.self.name;
const who = (id) => names[id] ?? id;
const kindName = { record: '紀錄', statement: '說法' };

const out = [];
const p = (line = '') => out.push(line);
const image = (img) => (img ? `［照片：${img.label ?? ''}］〔點開看到：${img.description}〕` : '');

p(`# ${caseId} 文本預覽`);
p();
p('這份檔案由 `node tools/preview.mjs` 從資料檔產生，請不要直接修改。要改文本請改 `content/` 底下的資料檔。');
if (meta.draft) {
  p();
  p('**狀態：寫作中，資料檔還沒寫齊。**');
}

p();
p('## 開場');
for (const seg of meta.intro ?? []) {
  p();
  if (seg.kind === 'quote') {
    for (const l of seg.lines) p(`> ${l}  `);
    if (seg.signature) p(`> —— ${seg.signature}`);
  } else if (seg.kind === 'notice') {
    p(`**［${seg.label}］**  `);
    p(seg.lines.join('  \n'));
  } else if (seg.kind === 'guide') {
    p(`**【介紹頁：${seg.title}】**  `);
    p(seg.lines.join('  \n'));
    p();
    for (const item of seg.items) p(`- **${item.label}**：${item.text}`);
  } else {
    p(seg.lines.join('  \n'));
  }
}
if (meta.castIntro || characters.some((c) => c.brief)) {
  p();
  p('### 人物背景（放在「聯絡人」App 裡，玩家自己打開才看得到）');
  p();
  for (const l of meta.castIntro ?? []) p(`${l}  `);
  p();
  for (const c of characters) if (c.brief) p(`- **${c.name}**：${c.brief}`);
}

p();
p('### 開局固定送出的那句話');
p();
p(`> ${meta.coverStory ?? ''}`);

p();
p('## 各個 App');
for (const app of apps.apps) {
  p();
  const folder = apps.folders.find((f) => f.id === app.folder);
  p(`### ${app.name}${folder ? `（收在「${folder.name}」資料夾）` : ''}`);
  p();
  if (app.background || app.view === 'none') {
    p(`背景 App，沒有線索。${app.emptyText ? `打開時顯示：「${app.emptyText}」` : ''}`);
    continue;
  }
  if (app.view === 'contacts') {
    p('人物介紹放在這裡，內容見上方「人物背景」。');
    continue;
  }
  if (app.view === 'assistant') {
    p('助理自己的 App。疑點和時間軸都在這裡，內容隨遊戲進行產生。');
    continue;
  }
  if (app.view === 'chat') {
    p('內容見下方「聊天室」。');
    continue;
  }
  const rows = items.filter((i) => i.app === app.id);
  if (rows.length === 0) p('（還沒有內容）');
  for (const it of rows) {
    const speaker = it.speaker ? `｜${who(it.speaker)}` : '';
    const locate = it.needsLocate ? '｜要先定位才看得到' : '';
    const tag = it.flavor ? '無關，不進推理' : `${kindName[it.kind]}${speaker}${locate}`;
    const day = it.date ? `${it.date}${it.time ? ` ${it.time}` : ''}` : (it.when ?? '');
    p(`- **${it.title ?? ''}**　${day}　〔${tag}〕`);
    if (it.app === 'calendar') continue;
    for (const line of String(it.body).split('\n')) p(`  ${line}  `);
    for (const f of it.fields ?? []) p(`  ${f.label}：${f.value}  `);
    if (it.image) p(`  ${image(it.image)}`);
  }
}

const flavor = read('flavor', null);
if (flavor) {
  p();
  p('## 背景 App 裡的生活內容（跟案情無關）');
  p();
  p('### 時鐘：鬧鐘');
  p();
  for (const a of flavor.alarms ?? []) p(`- ${a.time}　${a.label}　${a.repeat}　${a.on ? '開' : '關'}`);
  p();
  p(`世界時鐘：${(flavor.worldClocks ?? []).map((c) => c.city).join('、')}`);
  p();
  p('### 音樂：歌單（歌名和演出者都是虛構的）');
  p();
  for (const t of flavor.playlist ?? []) p(`- ${t.title}　${t.artist}`);
  p();
  p('### 碎念：動態牆（帳號都是虛構的）');
  p();
  for (const t of flavor.posts ?? []) p(`- **${t.author}**　${t.when}：${t.text}`);
}
if (meta.wander) {
  p();
  p(`### 亂逛提醒（連續打開 ${meta.wander.after} 個背景 App 後跳出）`);
  p();
  for (const h of meta.wander.hints) p(`- ${h}`);
}

p();
p('## 聊天室');
p();
p('標「★」的訊息會進推理用的備忘錄。');
for (const th of threads) {
  p();
  p(`### ${th.title}${th.unread ? `（未讀 ${th.unread}）` : ''}`);
  let day = null;
  for (const m of th.history) {
    const [d, t = ''] = m.when.split(' ');
    if (d !== day) {
      p();
      p(`**${d}**`);
      p();
      day = d;
    }
    const mark = m.item ? ' ★' : '';
    p(`- ${t ? `${t}　` : ''}**${who(m.from)}**：${m.text ?? ''}${m.image ? ` ${image(m.image)}` : ''}${mark}`);
  }
}

const events = read('events', []);
const links = read('links', []);
const cards = read('cards', []);
const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
const threadById = Object.fromEntries(threads.map((t) => [t.id, t]));
const cardById = Object.fromEntries(cards.map((c) => [c.id, c]));
const itemLabel = (id) => {
  const it = itemById[id];
  if (!it) return id;
  const text = it.kind === 'statement' ? `${who(it.speaker)}：「${it.body}」` : `${it.title ?? ''}${it.when ? `（${it.when}）` : ''}`;
  return text;
};
const effectText = (fx) => {
  if (!fx) return '';
  const parts = [];
  for (const [id, n] of Object.entries(fx.ladder ?? {})) parts.push(`${who(id)}${n > 0 ? `升 ${n} 級` : n < 0 ? `降 ${-n} 級` : '不變'}`);
  for (const [id, n] of Object.entries(fx.ladderTo ?? {})) parts.push(`${who(id)}直接到第 ${n} 級`);
  for (const [k, v] of Object.entries(fx.flags ?? {})) parts.push(`記下「${k}」＝${v ? '是' : '否'}`);
  return parts.length ? `〔${parts.join('、')}〕` : '';
};
const signalText = (sg) => {
  if (!sg) return '';
  const parts = [];
  if (sg.readDelay) parts.push(sg.readDelay);
  if (sg.typingStops) parts.push('「正在輸入」出現又消失');
  if (sg.noReply) parts.push('已讀不回');
  return parts.length ? `（${parts.join('，')}）` : '';
};

if (events.length) {
  p();
  p('## 對方主動傳來的訊息與玩家的回覆選項');
  const cover = new Set(meta.afterCover ?? []);
  for (const ev of events) {
    p();
    if (ev.kind === 'message') {
      const where = threadById[ev.thread]?.title ?? ev.thread;
      const tag = cover.has(ev.id) ? '掩護說法送出後' : ev.id;
      p(`### ${who(ev.from)}｜${where}｜${tag}${ev.delay ? `（再耗 ${ev.delay}% 電才出現）` : ''}`);
      p();
      for (const t of ev.text) p(`- **${who(ev.from)}**：${t}`);
      for (const id of ev.reveals ?? []) p(`- ★ 進備忘錄：${itemLabel(id)}`);
      for (const opt of ev.options ?? []) {
        p();
        p(`玩家回：「${opt.text}」 ${effectText(opt.effects)}`);
        p();
        for (const t of opt.reply ?? []) p(`- **${who(ev.from)}**：${t}`);
        if (opt.signal) p(`- ${signalText(opt.signal)}`);
        for (const id of opt.reveals ?? []) p(`- ★ 進備忘錄：${itemLabel(id)}`);
      }
    } else if (ev.kind === 'system') {
      p(`### 系統視窗｜${ev.title}`);
      p();
      for (const l of ev.lines) p(`${l}  `);
      for (const opt of ev.options ?? []) p(`- 按「${opt.label}」 ${effectText(opt.effects)}`);
      if (ev.onTimeout) p(`- 不理它 ${effectText(ev.onTimeout)}`);
    } else if (ev.kind === 'call') {
      p(`### 來電｜${who(ev.from)}｜${ev.id}`);
      p();
      const then = (b) => (b?.then ?? []).map((id) => id).join('、') || '沒有後續';
      p(`- 掛斷（扣 ${meta.battery?.cost?.callDecline ?? '?'}% 電） ${effectText(ev.onDecline?.effects)}　接著：${then(ev.onDecline)}`);
      p(`- 放著響完（扣 ${meta.battery?.cost?.callRing ?? '?'}% 電） ${effectText(ev.onMissed?.effects)}　接著：${then(ev.onMissed)}`);
      if (ev.repeat) p(`- 連環來電：每隔 ${ev.repeat.everyActions} 個動作再打一通，直到條件成立`);
    } else {
      p(`### 結局事件｜${ev.ending}`);
    }
  }
}

if (false && links.length) { // links.json 是已停用的舊資料（拖曳比對），不再列進預覽
  p();
  p('## 備忘錄的比對');
  p();
  p('| 說法 | 紀錄 | 結果 | 發現的疑點 |');
  p('| --- | --- | --- | --- |');
  for (const l of links) {
    const got = (l.unlocks ?? []).map((id) => cardById[id]?.title ?? id).join('、');
    p(`| ${itemLabel(l.statement)} | ${itemLabel(l.record)} | ${l.result === 'match' ? '吻合' : '矛盾'} | ${got} |`);
  }
}

if (cards.length) {
  p();
  p('## 疑點（可以拿去試探人）');
  p();
  for (const c of cards) {
    const to = c.targets ? `｜只能問${c.targets.map(who).join('、')}` : '';
    const where = c.thread ? `｜在「${threadById[c.thread]?.title ?? c.thread}」送出` : '';
    const need = c.availableWhen?.seen ? `｜看過 ${c.availableWhen.seen.map(itemLabel).join('、')} 就拿到` : '';
    p(`- **${c.title}**：${c.thinkOnly ? '不能拿去問人，只用在指認' : `「${c.say}」`}${to}${where}${need}`);
    if (c.spot) {
      const right = [].concat(c.spot.answer);
      const opts = c.spot.options.map((o) => (right.includes(o.id) ? `**${o.text}**（對）` : o.text)).join('／');
      p(`  - 要先指出細節才成立。Suru 問：「${c.spot.prompt ?? ''}」　選項：${opts}`);
      if (c.spot.miss) p(`  - 指錯時 Suru 說：「${c.spot.miss}」`);
    }
  }
}

const reactions = read('reactions', []);
const eventById = Object.fromEntries(events.map((e) => [e.id, e]));
if (reactions.length) {
  p();
  p('## 試探的反應（有內容的格子）');
  p();
  p('沒列在這裡的組合，一律用該角色的通用反應。');
  for (const r of reactions) {
    p();
    p(`### ${cardById[r.card]?.title ?? r.card} × ${who(r.target)} ${effectText(r.effects)}`);
    p();
    for (const t of r.reply) p(`- **${who(r.target)}**：${t}`);
    if (r.signal) p(`- ${signalText(r.signal)}`);
    for (const o of r.others ?? []) {
      for (const t of o.reply) p(`- **${who(o.from)}**：${t}`);
      if (o.signal) p(`- ${who(o.from)}${signalText(o.signal)}`);
    }
    for (const id of r.reveals ?? []) p(`- ★ 進備忘錄：${itemLabel(id)}`);
    for (const id of r.triggers ?? []) {
      const e = eventById[id];
      p(`- 接著發生：${e?.kind === 'system' ? `系統視窗「${e.title}」` : e?.kind === 'call' ? `${who(e.from)}來電` : e ? `${who(e.from)}傳來「${e.text[0]}」` : id}`);
    }
  }
}

if (characters.some((c) => c.ladder?.some((s) => s.onEnter.length))) {
  p();
  p('## 四條階梯');
  for (const c of characters) {
    p();
    p(`### ${c.name}`);
    p();
    for (const s of c.ladder) {
      const what = s.onEnter
        .map((id) => {
          const e = eventById[id];
          if (!e) return id;
          if (e.kind === 'system') return `系統視窗「${e.title}」`;
          if (e.kind === 'ending') return `結局 ${e.ending}`;
          if (e.kind === 'call') return `${who(e.from)}來電${e.repeat ? '（連環）' : ''}`;
          return `${who(e.from)}：「${e.text[0]}」…`;
        })
        .join('　或　');
      p(`${s.level}. ${s.id}　${what || '（還沒寫）'}`);
    }
  }
}

const conclusions = read('conclusions', []);
const voice = read('voice', []);
if (conclusions.length) {
  p();
  p('## 關鍵結論與備援路徑');
  for (const c of conclusions) {
    p();
    p(`### ${c.text}`);
    p();
    c.routes.forEach((route, i) => p(`- 第 ${i + 1} 條路：${route.map(itemLabel).join(' ＋ ')}`));
    for (const v of voice.filter((x) => x.conclusion === c.id).sort((a, b) => a.level - b.level)) p(`- 心聲第 ${v.level} 級：${v.text}`);
  }
}
const ambient = voice.filter((v) => !v.conclusion);
if (ambient.length) {
  p();
  p('## 其他心聲');
  p();
  for (const v of ambient) {
    const cond = v.when?.seen ? `看過 ${v.when.seen.map(itemLabel).join('、')} 之後` : v.when?.flags ? '特定情況下' : '隨時';
    p(`- ${v.text}　〔${cond}〕`);
  }
}

const endingsFile = read('endings', null);
if (endingsFile) {
  const ch = endingsFile.challenge;
  p();
  p('## 指認兇手（挑戰書）');
  p();
  for (const l of ch.intro ?? []) p(`> ${l}  `);
  if (ch.intro) p();
  p(`0. ${ch.whoPrompt}　可選：${ch.suspects.map(who).join('、')}　〔答案：${who(ch.culprit)}〕`);
  ch.fields.forEach((f, i) => {
    p(`${i + 1}. ${f.prompt}`);
    p(`   - 算對的疑點（任一張）：${(f.cards ?? []).map((id) => '「' + (cards.find((c) => c.id === id)?.title ?? id) + '」').join('、')}`);
    p(`   - 沒選對時的提示：${f.hint}`);
  });
  p();
  p(`可以交給：${ch.recipients.map(who).join('、')}。${endingsFile.endings.some((e) => e.trigger.fieldsWrong) ? '指對人但有格子放錯：不退回，進「站不住」結局。' : `指對人但有欄位沒選對：退回重填，扣 ${meta.battery?.cost?.challengeRetry ?? '?'}% 電。`}`);
  p();
  p('## 結局');
  for (const e of endingsFile.endings) {
    const t = e.trigger;
    let cond = '';
    if (t.kind === 'battery') cond = '電量歸零';
    else if (t.kind === 'ladder') cond = `${who(t.character)}的階梯到第 ${t.level} 級`;
    else {
      const parts = [`指認${who(t.accused)}`];
      if (t.givenTo) parts.push(`交給${who(t.givenTo)}`);
      if (t.fieldsWrong) parts.push('但有格子放錯');
      for (const [k, v] of Object.entries(t.flags ?? {})) parts.push(`「${k}」＝${v ? '是' : '否'}`);
      cond = parts.join('、');
    }
    p();
    p(`### ${e.title}　〔${cond}〕`);
    p();
    for (const line of e.text) {
      if (line === '{rebuttals}') {
        p('（依放錯的格子出現，放錯幾格就出現幾組）');
        p();
        for (const [field, lines] of Object.entries(e.rebuttals ?? {})) {
          const prompt = ch.fields.find((f) => f.id === field)?.prompt ?? field;
          for (const x of lines) p(`- 「${prompt}」放錯：${x}`);
        }
        p();
        continue;
      }
      p(line);
      p();
    }
  }
  if (endingsFile.solution) {
    p();
    p(`### 解答篇：${endingsFile.solution.title}　〔指對兇手的結局之後接著顯示〕`);
    p();
    for (const line of endingsFile.solution.text) {
      p(line);
      p();
    }
  }
}

p();
p('## 每個人的通用反應（問到他不知道的事）');
for (const c of characters) {
  p();
  p(`### ${c.name}`);
  p();
  for (const reply of c.genericReplies ?? []) p(`- ${reply.join('／')}`);
}

const target = join(root, 'docs', 'preview', `${caseId}.md`);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${out.join('\n')}\n`);
console.log(`已產生 ${target}`);
