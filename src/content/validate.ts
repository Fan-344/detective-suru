// 內容的格式檢查。輸入是剛讀進來、還沒確認形狀的 JSON，輸出是問題清單。
// 這裡只檢查「資料寫得對不對」：欄位、型別、id 有沒有對上。
// 「每個結論玩不玩得到、有沒有死路」屬於步驟二的 tools/validate.ts。

import { parseWhen } from './when';
import type { CaseContent } from './types';

export interface Issue {
  /** 哪個檔案，例如 items.json */
  file: string;
  /** 檔案裡的哪一筆，例如「第 3 筆（rcp_1842）」 */
  where: string;
  message: string;
}

/** 每個檔名對應到解析後的 JSON。缺檔時該鍵不存在。 */
export type RawCase = Partial<Record<CaseFileName, unknown>>;

export const CASE_FILES = [
  'meta',
  'characters',
  'apps',
  'items',
  'threads',
  'links',
  'cards',
  'reactions',
  'events',
  'conclusions',
  'voice',
  'endings',
] as const;
export type CaseFileName = (typeof CASE_FILES)[number];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

export function validateCase(raw: RawCase): Issue[] {
  const issues: Issue[] = [];

  /** 針對某個檔案的某一筆回報問題 */
  const reporter = (file: string, where: string) => (message: string) => issues.push({ file: `${file}.json`, where, message });

  const label = (index: number, entry: unknown) =>
    isObj(entry) && isStr(entry.id) ? `第 ${index + 1} 筆（${entry.id}）` : `第 ${index + 1} 筆`;

  /** 取出一個檔案裡的陣列，逐筆確認是物件；回傳通過的那些 */
  const list = (file: CaseFileName, value: unknown, what = '最外層'): { entry: Obj; say: (m: string) => void }[] => {
    if (!Array.isArray(value)) {
      reporter(file, what)('應該是一個陣列');
      return [];
    }
    const out: { entry: Obj; say: (m: string) => void }[] = [];
    value.forEach((entry, i) => {
      const say = reporter(file, label(i, entry));
      if (isObj(entry)) out.push({ entry, say });
      else say('應該是一個物件');
    });
    return out;
  };

  /** 必填文字欄位 */
  const need = (entry: Obj, say: (m: string) => void, ...keys: string[]) => {
    for (const k of keys) if (!isStr(entry[k])) say(`缺少 ${k}，或 ${k} 不是文字`);
  };

  /** 收集 id 並檢查重複 */
  const collectIds = (rows: { entry: Obj; say: (m: string) => void }[]) => {
    const ids = new Set<string>();
    for (const { entry, say } of rows) {
      if (!isStr(entry.id)) {
        say('缺少 id');
        continue;
      }
      if (ids.has(entry.id)) say(`id「${entry.id}」重複了`);
      ids.add(entry.id);
    }
    return ids;
  };

  /** 檢查一個 id（或一串 id）有沒有對到某個集合 */
  const refs = (say: (m: string) => void, field: string, value: unknown, known: Set<string>, kind: string) => {
    if (value === undefined) return;
    const arr = Array.isArray(value) ? value : [value];
    for (const v of arr) {
      if (!isStr(v)) say(`${field} 裡有不是文字的值`);
      else if (!known.has(v)) say(`${field} 指向不存在的${kind}「${v}」`);
    }
  };

  for (const name of CASE_FILES) {
    if (raw[name] === undefined) reporter(name, '整個檔案')('找不到這個檔案');
  }

  // ── meta ──
  const meta = isObj(raw.meta) ? raw.meta : {};
  const sayMeta = reporter('meta', '最外層');
  let dayOrder: string[] = [];
  if (raw.meta !== undefined) {
    if (!isObj(raw.meta)) sayMeta('應該是一個物件');
    need(meta, sayMeta, 'id', 'coverStory');
    if (isStrArr(meta.dayOrder) && meta.dayOrder.length > 0) dayOrder = meta.dayOrder;
    else sayMeta('缺少 dayOrder，或 dayOrder 不是文字陣列');
    const battery = isObj(meta.battery) ? meta.battery : null;
    if (!battery) sayMeta('缺少 battery');
    else {
      if (!isNum(battery.start) || battery.start <= 0 || battery.start > 100) sayMeta('battery.start 應該是 1 到 100 的數字');
      if (!isNum(battery.ladderTickEvery) || battery.ladderTickEvery <= 0) sayMeta('battery.ladderTickEvery 應該是正數');
      const cost = isObj(battery.cost) ? battery.cost : {};
      for (const k of ['openApp', 'readThread', 'send', 'locate']) {
        if (!isNum(cost[k]) || (cost[k] as number) < 0) sayMeta(`battery.cost.${k} 應該是不小於 0 的數字`);
      }
    }
  }

  const checkWhen = (say: (m: string) => void, value: unknown, required: boolean) => {
    if (value === undefined) {
      if (required) say('缺少 when');
      return;
    }
    if (!isStr(value) || !parseWhen(value, dayOrder)) {
      say(`when「${String(value)}」看不懂。寫法例如「週六 18:42」「週六 約22:00」「週五」「較早」，而且那一天要列在 meta.json 的 dayOrder 裡`);
    }
  };

  // ── 先收集所有 id，後面才能互相對照 ──
  const characters = list('characters', raw.characters ?? []);
  const characterIds = collectIds(characters);
  const selfId = isObj(meta.self) && isStr(meta.self.id) ? meta.self.id : null;
  const speakerIds = new Set(characterIds);
  if (selfId) speakerIds.add(selfId);

  const appsFile = isObj(raw.apps) ? raw.apps : {};
  if (raw.apps !== undefined && !isObj(raw.apps)) reporter('apps', '最外層')('應該是一個物件，裡面有 apps 和 folders');
  const apps = list('apps', appsFile.apps ?? [], 'apps');
  const appIds = collectIds(apps);
  const folders = list('apps', appsFile.folders ?? [], 'folders');
  const folderIds = collectIds(folders);

  const items = list('items', raw.items ?? []);
  const itemIds = collectIds(items);
  const threads = list('threads', raw.threads ?? []);
  const threadIds = collectIds(threads);
  const cards = list('cards', raw.cards ?? []);
  const cardIds = collectIds(cards);
  const events = list('events', raw.events ?? []);
  const eventIds = collectIds(events);
  const conclusions = list('conclusions', raw.conclusions ?? []);
  const conclusionIds = collectIds(conclusions);
  const voice = list('voice', raw.voice ?? []);
  collectIds(voice);

  const endingsFile = isObj(raw.endings) ? raw.endings : {};
  if (raw.endings !== undefined && !isObj(raw.endings)) reporter('endings', '最外層')('應該是一個物件，裡面有 challenge 和 endings');
  const endings = list('endings', endingsFile.endings ?? [], 'endings');
  const endingIds = collectIds(endings);

  if (isStr(meta.coverThread)) refs(sayMeta, 'coverThread', meta.coverThread, threadIds, '聊天室');
  refs(sayMeta, 'afterCover', meta.afterCover, eventIds, '事件');

  const itemKind = new Map<string, unknown>();
  for (const { entry } of items) if (isStr(entry.id)) itemKind.set(entry.id, entry.kind);

  const checkCondition = (say: (m: string) => void, field: string, value: unknown) => {
    if (value === undefined) return;
    if (!isObj(value)) return void say(`${field} 應該是一個物件`);
    if (value.ladder !== undefined) {
      if (!isObj(value.ladder)) say(`${field}.ladder 應該是一個物件`);
      else refs(say, `${field}.ladder`, Object.keys(value.ladder), characterIds, '人物');
    }
    refs(say, `${field}.seen`, value.seen, itemIds, ' item ');
    refs(say, `${field}.notSeen`, value.notSeen, itemIds, ' item ');
  };

  const checkEffects = (say: (m: string) => void, field: string, value: unknown) => {
    if (value === undefined) return;
    if (!isObj(value)) return void say(`${field} 應該是一個物件`);
    for (const key of ['ladder', 'ladderTo']) {
      const map = value[key];
      if (map === undefined) continue;
      if (!isObj(map)) {
        say(`${field}.${key} 應該是一個物件`);
        continue;
      }
      refs(say, `${field}.${key}`, Object.keys(map), characterIds, '人物');
      for (const [who, n] of Object.entries(map)) if (!Number.isInteger(n)) say(`${field}.${key}.${who} 應該是整數`);
    }
  };

  checkEffects(sayMeta, 'afterCoverEffects', meta.afterCoverEffects);

  // ── characters ──
  for (const { entry, say } of characters) {
    need(entry, say, 'name', 'style');
    if (!Array.isArray(entry.genericReplies) || entry.genericReplies.length === 0 || !entry.genericReplies.every(isStrArr)) {
      say('genericReplies 至少要有一組通用反應，每一組是幾則訊息的陣列');
    }
    if (!Array.isArray(entry.ladder) || entry.ladder.length === 0) {
      say('ladder 至少要有一級');
      continue;
    }
    entry.ladder.forEach((step, i) => {
      if (!isObj(step)) return void say(`ladder 第 ${i + 1} 級應該是一個物件`);
      if (step.level !== i + 1) say(`ladder 第 ${i + 1} 級的 level 應該是 ${i + 1}，等級要從 1 連續編號`);
      if (!isStr(step.id)) say(`ladder 第 ${i + 1} 級缺少 id`);
      if (!Array.isArray(step.onEnter)) say(`ladder 第 ${i + 1} 級缺少 onEnter（沒有事件就寫空陣列）`);
      else refs(say, `ladder 第 ${i + 1} 級的 onEnter`, step.onEnter, eventIds, '事件');
    });
  }

  // ── apps ──
  const VIEWS = ['chat', 'list', 'gallery', 'map', 'assistant', 'none'];
  for (const { entry, say } of apps) {
    need(entry, say, 'name', 'icon');
    if (!VIEWS.includes(entry.view as string)) say(`view 應該是 ${VIEWS.join('、')} 其中之一`);
    refs(say, 'folder', entry.folder, folderIds, '資料夾');
  }
  for (const { entry, say } of folders) need(entry, say, 'name', 'icon');

  // ── items ──
  for (const { entry, say } of items) {
    need(entry, say, 'app', 'body');
    refs(say, 'app', entry.app, appIds, ' App ');
    if (entry.kind !== 'record' && entry.kind !== 'statement') say('kind 應該是 record（紀錄）或 statement（說法）');
    if (entry.kind === 'statement' && !isStr(entry.speaker)) say('說法一定要寫 speaker（誰講的）');
    refs(say, 'speaker', entry.speaker, speakerIds, '人物');
    refs(say, 'thread', entry.thread, threadIds, '聊天室');
    checkWhen(say, entry.when, false);
    checkImage(say, 'image', entry.image);
  }

  // ── threads ──
  for (const { entry, say } of threads) {
    need(entry, say, 'title');
    if (!isStrArr(entry.members) || entry.members.length === 0) say('members 至少要有一個人');
    else refs(say, 'members', entry.members, characterIds, '人物');
    if (!Array.isArray(entry.history)) {
      say('缺少 history（沒有舊訊息就寫空陣列）');
      continue;
    }
    let last = -Infinity;
    entry.history.forEach((msg, i) => {
      const sayMsg = (m: string) => say(`history 第 ${i + 1} 則：${m}`);
      if (!isObj(msg)) return void sayMsg('應該是一個物件');
      if (!isStr(msg.from)) sayMsg('缺少 from');
      else if (!speakerIds.has(msg.from)) sayMsg(`from 指向不存在的人物「${msg.from}」`);
      if (!isStr(msg.text) && msg.image === undefined) sayMsg('text 和 image 至少要有一個');
      checkWhen(sayMsg, msg.when, true);
      checkImage(sayMsg, 'image', msg.image);
      refs(sayMsg, 'item', msg.item, itemIds, ' item ');
      const parsed = isStr(msg.when) ? parseWhen(msg.when, dayOrder) : null;
      if (parsed) {
        if (parsed.sort < last) sayMsg(`時間「${msg.when}」比上一則還早，舊訊息要依時間先後排`);
        last = parsed.sort;
      }
    });
  }

  // ── links ──
  for (const { entry, say } of list('links', raw.links ?? [])) {
    for (const [field, kind, name] of [['statement', 'statement', '說法'], ['record', 'record', '紀錄']] as const) {
      const id = entry[field];
      if (!isStr(id)) say(`缺少 ${field}`);
      else if (!itemIds.has(id)) say(`${field} 指向不存在的 item「${id}」`);
      else if (itemKind.get(id) !== kind) say(`${field}「${id}」不是${name}`);
    }
    if (entry.result !== 'match' && entry.result !== 'conflict') say('result 應該是 match（吻合）或 conflict（矛盾）');
    refs(say, 'unlocks', entry.unlocks, cardIds, '測試牌');
  }

  // ── cards ──
  for (const { entry, say } of cards) {
    need(entry, say, 'title', 'say');
    refs(say, 'targets', entry.targets, characterIds, '人物');
    refs(say, 'thread', entry.thread, threadIds, '聊天室');
    if (isObj(entry.sayTo)) refs(say, 'sayTo', Object.keys(entry.sayTo), characterIds, '人物');
    checkCondition(say, 'availableWhen', entry.availableWhen);
  }

  // ── reactions ──
  const revealed = new Set<string>();
  const noteReveals = (value: unknown) => {
    if (Array.isArray(value)) for (const v of value) if (isStr(v)) revealed.add(v);
  };
  list('reactions', raw.reactions ?? []).forEach(({ entry, say }) => {
    const sayR = (m: string) => say(`（${String(entry.card)} × ${String(entry.target)}）${m}`);
    if (!isStr(entry.card)) sayR('缺少 card');
    else refs(sayR, 'card', entry.card, cardIds, '測試牌');
    if (!isStr(entry.target)) sayR('缺少 target');
    else refs(sayR, 'target', entry.target, characterIds, '人物');
    if (!isStrArr(entry.reply)) sayR('reply 應該是文字陣列，一則訊息一個元素（已讀不回就寫空陣列並設 signal.noReply）');
    checkCondition(sayR, 'when', entry.when);
    checkEffects(sayR, 'effects', entry.effects);
    refs(sayR, 'reveals', entry.reveals, itemIds, ' item ');
    refs(sayR, 'triggers', entry.triggers, eventIds, '事件');
    noteReveals(entry.reveals);
    if (Array.isArray(entry.others)) {
      for (const o of entry.others) if (isObj(o)) refs(sayR, 'others.from', o.from, characterIds, '人物');
    }
  });

  // ── events ──
  for (const { entry, say } of events) {
    refs(say, 'reveals', entry.reveals, itemIds, ' item ');
    noteReveals(entry.reveals);
    if (entry.kind === 'message') {
      refs(say, 'thread', entry.thread, threadIds, '聊天室');
      refs(say, 'from', entry.from, characterIds, '人物');
      if (!isStr(entry.thread)) say('缺少 thread');
      if (!isStr(entry.from)) say('缺少 from');
      if (!isStrArr(entry.text)) say('text 應該是文字陣列，一則訊息一個元素');
      checkCondition(say, 'when', entry.when);
      checkEffects(say, 'effects', entry.effects);
      checkImage(say, 'image', entry.image);
      if (entry.options !== undefined) {
        if (!Array.isArray(entry.options)) say('options 應該是陣列');
        else
          entry.options.forEach((opt, i) => {
            const sayO = (m: string) => say(`options 第 ${i + 1} 個：${m}`);
            if (!isObj(opt)) return void sayO('應該是一個物件');
            need(opt, sayO, 'id', 'text');
            checkEffects(sayO, 'effects', opt.effects);
            refs(sayO, 'reveals', opt.reveals, itemIds, ' item ');
            noteReveals(opt.reveals);
          });
      }
    } else if (entry.kind === 'system') {
      need(entry, say, 'title');
      if (!isStrArr(entry.lines)) say('lines 應該是文字陣列');
      checkEffects(say, 'onTimeout', entry.onTimeout);
      if (Array.isArray(entry.options)) {
        entry.options.forEach((opt, i) => {
          const sayO = (m: string) => say(`options 第 ${i + 1} 個：${m}`);
          if (!isObj(opt)) return void sayO('應該是一個物件');
          need(opt, sayO, 'id', 'label');
          checkEffects(sayO, 'effects', opt.effects);
        });
      }
    } else if (entry.kind === 'ending') {
      refs(say, 'ending', entry.ending, endingIds, '結局');
      if (!isStr(entry.ending)) say('缺少 ending');
    } else {
      say('kind 應該是 message、system 或 ending');
    }
  }

  // ── 隱藏的 item 一定要有東西把它帶出來 ──
  for (const { entry, say } of items) {
    if (entry.hidden === true && isStr(entry.id) && !revealed.has(entry.id)) {
      say('標了 hidden，但沒有任何反應或事件的 reveals 會帶出它，玩家永遠看不到');
    }
  }

  // ── conclusions ──
  for (const { entry, say } of conclusions) {
    need(entry, say, 'text');
    if (!Array.isArray(entry.routes) || !entry.routes.every(isStrArr)) {
      say('routes 應該是陣列的陣列，每條路是一組 item 的 id');
      continue;
    }
    if (entry.routes.length < 2) say(`只有 ${entry.routes.length} 條路，每個結論至少要兩條`);
    entry.routes.forEach((route, i) => {
      if (route.length === 0) say(`第 ${i + 1} 條路是空的`);
      refs(say, `第 ${i + 1} 條路`, route, itemIds, ' item ');
    });
  }

  // ── voice ──
  for (const { entry, say } of voice) {
    need(entry, say, 'text');
    refs(say, 'conclusion', entry.conclusion, conclusionIds, '結論');
    if (entry.conclusion !== undefined && ![1, 2, 3].includes(entry.level as number)) say('對應結論的心聲要寫 level（1、2 或 3）');
    checkCondition(say, 'when', entry.when);
  }
  for (const id of conclusionIds) {
    for (const level of [1, 2, 3]) {
      if (!voice.some(({ entry }) => entry.conclusion === id && entry.level === level)) {
        reporter('voice', `結論「${id}」`)(`缺少第 ${level} 級的心聲`);
      }
    }
  }

  // ── endings ──
  if (raw.endings !== undefined) {
    const sayC = reporter('endings', 'challenge');
    const challenge = isObj(endingsFile.challenge) ? endingsFile.challenge : null;
    if (!challenge) sayC('缺少 challenge');
    else {
      refs(sayC, 'recipients', challenge.recipients, characterIds, '人物');
      need(challenge, sayC, 'whoPrompt', 'culprit');
      refs(sayC, 'culprit', challenge.culprit, characterIds, '人物');
      refs(sayC, 'suspects', challenge.suspects, characterIds, '人物');
      if (!isStrArr(challenge.suspects)) sayC('suspects 應該是人物 id 的陣列');
      else if (isStr(challenge.culprit) && !challenge.suspects.includes(challenge.culprit)) sayC('culprit 不在 suspects 裡，玩家永遠選不到正確答案');
      if (!isStrArr(challenge.recipients)) sayC('recipients 應該是人物 id 的陣列');
      if (!Array.isArray(challenge.fields) || challenge.fields.length === 0) sayC('fields 至少要有一欄');
      else
        challenge.fields.forEach((field, i) => {
          const sayF = (m: string) => sayC(`fields 第 ${i + 1} 欄：${m}`);
          if (!isObj(field)) return void sayF('應該是一個物件');
          need(field, sayF, 'id', 'prompt', 'hint');
          if (!Array.isArray(field.accept) || field.accept.length === 0 || !field.accept.every(isStrArr)) {
            return void sayF('accept 至少要有一組可接受的答案');
          }
          for (const group of field.accept) {
            for (const id of group) {
              if (!itemIds.has(id)) sayF(`accept 指向不存在的 item「${id}」`);
              else if (itemKind.get(id) !== 'record') sayF(`accept 裡的「${id}」不是紀錄。每一項答案都必須指向紀錄`);
            }
          }
        });
    }
    for (const { entry, say } of endings) {
      need(entry, say, 'title');
      if (!isStrArr(entry.text) || entry.text.length === 0) say('text 應該是文字陣列，一段一個元素');
      const trigger = isObj(entry.trigger) ? entry.trigger : null;
      if (!trigger || !['battery', 'ladder', 'challenge'].includes(trigger.kind as string)) {
        say('trigger.kind 應該是 battery、ladder 或 challenge');
        continue;
      }
      refs(say, 'trigger.character', trigger.character, characterIds, '人物');
      refs(say, 'trigger.accused', trigger.accused, characterIds, '人物');
      refs(say, 'trigger.givenTo', trigger.givenTo, characterIds, '人物');
    }
  }

  return issues;

  function checkImage(say: (m: string) => void, field: string, value: unknown) {
    if (value === undefined) return;
    if (!isObj(value) || !isStr(value.description)) say(`${field} 一定要有 description（用文字描述圖裡看得到什麼）`);
  }
}

/** 把問題清單排成給人看的文字，一行一個問題。 */
export function formatIssues(issues: Issue[]): string {
  return issues.map((i) => `${i.file}｜${i.where}｜${i.message}`).join('\n');
}

export class ContentError extends Error {
  constructor(public readonly issues: Issue[]) {
    super(`內容檔有 ${issues.length} 個問題：\n${formatIssues(issues)}`);
    this.name = 'ContentError';
  }
}

/** 檢查通過才回傳內容；有任何問題就丟出 ContentError，訊息裡列出全部問題。 */
export function assembleCase(raw: RawCase): CaseContent {
  const issues = validateCase(raw);
  if (issues.length > 0) throw new ContentError(issues);
  return raw as unknown as CaseContent;
}
