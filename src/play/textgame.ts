// 文字冒險版的共用部分：把 engine 的狀態變成「一段文字＋幾個編號選項」。
// 終端機（tools/play.ts）和網頁（src/play/web.ts）都用這個，兩邊只負責顯示和收輸入。
// 這裡的字串只有介面用語；劇情文字全部來自資料檔。

import type { CaseContent, ImageRef, Item, Message, Signal } from '../content/types';
import { createEngine, endingText, isSolvedEnding, memo, spotOf, type Action, type AppendedMessage, type Engine, type GameState, type Outcome } from '../engine';

export interface Choice {
  label: string;
  run: () => void;
}

export interface TextGameOptions {
  /** 顯示階梯等級的變化。給開發時看，正式試玩不開。 */
  debug?: boolean;
}

export class TextGame {
  readonly engine: Engine;
  state: GameState;
  private readonly content: CaseContent;
  private readonly debug: boolean;
  private pending: string[] = [];
  private screen: () => Choice[];

  constructor(content: CaseContent, options: TextGameOptions = {}) {
    this.content = content;
    this.engine = createEngine(content);
    this.debug = options.debug ?? false;
    this.state = this.engine.start();
    this.screen = this.home;
    this.intro();
  }

  /** 取走還沒顯示的文字 */
  flush(): string[] {
    const lines = this.pending;
    this.pending = [];
    return lines;
  }

  get battery(): number {
    // 電量可以是小數，顯示時取整；還有電就不顯示 0
    return Math.ceil(this.state.battery);
  }

  choices(): Choice[] {
    const s = this.state;
    if (s.phase === 'ended') {
      const list: Choice[] = [];
      // 經過指認進入的結局可以回去：指錯人回到交出去之前；破案回到選交給誰之前（可以改交給別人）
      const ended = this.content.endings.endings.find((e) => e.id === s.ended);
      const solved = ended !== undefined && isSolvedEnding(this.content, ended);
      if (this.engine.menu(s).canRewind) list.push({ label: solved ? '回到選交給誰之前' : '回到指認之前', run: () => void this.act({ type: 'rewindChallenge' }) });
      list.push({ label: '重新開始', run: () => this.restart() });
      return list;
    }
    if (s.phase === 'cover') return [{ label: '送出', run: () => this.act({ type: 'sendCover' }) }];
    const call = this.engine.menu(s).call;
    if (call) {
      // 電話在響：只能掛斷或讓它響完
      return [
        { label: '掛斷' + this.costTag(call.declineCost), run: () => void this.act({ type: 'declineCall' }) },
        { label: '不接，讓它響完' + this.costTag(call.ringCost), run: () => void this.act({ type: 'letRing' }) },
      ];
    }
    if (s.prompt) {
      // 視窗不擋操作：按按鈕、關掉，或直接選後面的事（等於不理它）
      const e = this.content.events.find((x) => x.id === s.prompt);
      const options = e?.kind === 'system' ? (e.options ?? []) : [];
      return [
        ...options.map((o) => ({ label: `視窗：按「${o.label}」`, run: () => this.act({ type: 'answerPrompt', option: o.id }) })),
        { label: '視窗：關閉', run: () => this.act({ type: 'answerPrompt', option: null }) },
        ...this.screen(),
      ];
    }
    return this.screen();
  }

  choose(index: number): boolean {
    const choice = this.choices()[index];
    if (!choice) return false;
    choice.run();
    return true;
  }

  // ───────────── 輸出 ─────────────

  private say(...lines: string[]) {
    this.pending.push(...lines);
  }

  private name(id: string): string {
    if (id === this.content.meta.self?.id) return this.content.meta.self.name;
    return this.content.characters.find((c) => c.id === id)?.name ?? id;
  }

  private item(id: string): Item | undefined {
    return this.content.items.find((i) => i.id === id);
  }

  private threadTitle(id: string): string {
    return this.content.threads.find((t) => t.id === id)?.title ?? id;
  }

  /** 一行就能認出是哪一筆的短標籤 */
  private label(item: Item): string {
    const when = item.when ? `${item.when}　` : '';
    if (item.kind === 'statement') return `${when}${this.name(item.speaker ?? '')}：「${item.body.split('\n')[0]}」`;
    return `${when}${item.title ?? item.body.split('\n')[0]}`;
  }

  private signal(signal: Signal | undefined): string[] {
    if (!signal) return [];
    const parts = [signal.readDelay, signal.typingStops ? '「正在輸入」出現又消失' : undefined, signal.noReply ? '已讀不回' : undefined];
    const text = parts.filter(Boolean).join('，');
    return text ? [`　（${text}）`] : [];
  }

  private detail(item: Item) {
    this.say(`・${this.label(item)}${item.flavor ? '' : `　〔${item.kind === 'record' ? '紀錄' : '說法'}〕`}`);
    if (item.kind === 'record') for (const line of item.body.split('\n')) this.say(`　${line}`);
    for (const f of item.fields ?? []) this.say(`　${f.label}：${f.value}`);
    if (item.image) this.say(`　${this.photoTag(item.image)}`);
  }

  /** 照片還沒點開時的標示。細節要點開才看得到。 */
  private photoTag(image: ImageRef): string {
    return `［照片：${image.label ?? '照片'}］`;
  }

  private showPhoto(image: ImageRef) {
    this.say('', `── 照片：${image.label ?? '照片'} ──`, image.description);
  }

  private intro() {
    for (const seg of this.content.meta.intro ?? []) {
      if (seg.kind === 'notice') this.say(`［${seg.label}］`, ...seg.lines);
      else if (seg.kind === 'quote') this.say('————', ...seg.lines, ...(seg.signature ? [`　　　　　　${seg.signature}`] : []), '————');
      else this.say(...seg.lines);
      this.say('');
    }
    this.say(`${this.content.meta.self?.name ?? ''}：${this.content.meta.coverStory}`, '');
  }

  /** 人物背景，顯示在聯絡人 App 裡。文字全部來自資料檔，沒寫就不顯示。 */
  private cast() {
    const briefs = this.content.characters.filter((c) => c.brief);
    if (!this.content.meta.castIntro?.length && briefs.length === 0) return;
    this.say(...(this.content.meta.castIntro ?? []), '');
    for (const c of briefs) this.say(`${c.name}`, `　${c.brief}`, '');
  }

  private restart() {
    this.state = this.engine.start();
    this.screen = this.home;
    this.say('', '════════════════', '');
    this.intro();
  }

  private act(action: Action): Outcome[] {
    const { state, outcomes } = this.engine.step(this.state, action);
    this.state = state;
    for (const o of outcomes) this.render(o);
    if (state.phase === 'ended') this.screen = this.home;
    return outcomes;
  }

  private render(o: Outcome) {
    switch (o.kind) {
      case 'battery':
        this.say(`　〔電量 -${o.cost}%，剩 ${Math.ceil(o.battery)}%〕`);
        break;
      case 'sent':
        this.say(`［${this.threadTitle(o.thread)}］${this.name(this.content.meta.self?.id ?? '')}：${o.text}`);
        break;
      case 'message':
        for (const line of o.text) this.say(`［${this.threadTitle(o.thread)}］${this.name(o.from)}：${line}`);
        if (o.text.length === 0) this.say(`［${this.threadTitle(o.thread)}］${this.name(o.from)}`);
        if (o.image) this.say(`［${this.threadTitle(o.thread)}］${this.name(o.from)}：${this.photoTag(o.image)}`);
        this.say(...this.signal(o.signal));
        break;
      case 'items':
        for (const id of o.items) {
          const item = this.item(id);
          if (item && !item.flavor) this.say(`　＋備忘錄：${this.label(item)}`);
        }
        break;
      case 'cards':
        // 自己比對出來的才直接說；助理自己記下的不說是什麼，要玩家進 Suru 看
        if (o.via === 'found') for (const id of o.cards) this.say(`　＋發現疑點：${this.content.cards.find((c) => c.id === id)?.title ?? id}（可以拿去問人）`);
        break;
      case 'spot': {
        const card = this.content.cards.find((c) => c.id === o.card);
        const spot = card ? spotOf(card) : null;
        if (!o.right) this.say(spot?.miss ?? '（不是這裡。）');
        break;
      }
      case 'profile': {
        const c = this.content.characters.find((x) => x.id === o.character);
        const bio = c?.bioItem ? this.item(c.bioItem)?.body : c?.bio;
        this.say('', '── ' + this.name(o.character) + ' ──', bio ? '自介：' + bio : '（沒有自介）');
        break;
      }
      case 'hint':
        this.say('　……' + o.text + (o.more ? '' : '（這個疑點沒有更多提示了。）'));
        break;
      case 'assistantUnread':
        this.say(`　（${this.appName(this.content.apps.apps.find((a) => a.view === 'assistant')?.id ?? '')} 記下了一筆新的東西。）`);
        break;
      case 'prompt': {
        const e = this.content.events.find((x) => x.id === o.event);
        if (e?.kind === 'system') this.say('', `┌── 系統視窗：${e.title} ──`, ...e.lines.map((l) => `│ ${l}`), '└────────', '');
        break;
      }
      case 'promptHint':
        this.say('', `（${o.text}）`);
        break;
      case 'promptClosed':
        this.say(o.ignored ? '（視窗消失了。）' : '（視窗關掉了。）');
        break;
      case 'ladder':
        if (this.debug) this.say(`　〔除錯：${this.name(o.character)} ${o.from} → ${o.to}${o.auto ? '（自動）' : ''}〕`);
        break;
      case 'challengeAnswer': {
        // 答錯時只給那一題的提示；答對不多說，直接問下一題
        const f = this.content.endings.challenge.fields.find((x) => x.id === o.question);
        if (!o.right && f) this.say('', f.hint);
        break;
      }
      case 'challengeRejected':
        this.say('', '這份推理站不住，被退回來了。');
        for (const id of o.fields) {
          const f = this.content.endings.challenge.fields.find((x) => x.id === id);
          if (f) this.say('　' + f.hint);
        }
        break;
      case 'ending': {
        const e = this.content.endings.endings.find((x) => x.id === o.ending);
        if (e) this.say('', `════ 結局：${e.title} ════`, '', ...endingText(e, this.state).flatMap((p) => [p, '']));
        // 解答篇：只有指對兇手的結局才接著印
        const solution = this.content.endings.solution;
        if (e && solution && isSolvedEnding(this.content, e)) {
          this.say(`──── ${solution.title} ────`, '', ...solution.text.flatMap((p) => [p, '']));
        }
        break;
      }
      case 'rewound':
        this.say('', this.engine.menu(this.state).challenge?.form?.passed ? '（回到選交給誰之前。）' : '（回到指認之前。這是第 ' + (o.count + 1) + ' 次指認。）');
        this.screen = this.suru;
        break;
      case 'challengePassed':
        this.say('', '（第 ' + this.state.accusation.count + ' 次指認，這次對了。）');
        break;
      case 'noReply':
        this.say('（' + this.name(o.character) + '已讀，沒有回。）');
        break;
      case 'call':
        this.say('', '☎ ' + this.name(o.from) + ' 來電……（Suru 不能說話，接了也沒用。）');
        break;
      case 'callEnded':
        this.say(o.declined ? '（掛斷了。）' : '（響到自己停了。未接來電：' + this.name(o.from) + '）');
        break;
      case 'wander':
        this.say('', `（${o.text}）`);
        break;
      case 'invalid':
        this.say(`（不行：${o.reason}）`);
        break;
      case 'image': {
        const item = this.item(o.item);
        if (item?.image) this.showPhoto(item.image);
        break;
      }
      case 'app':
      case 'thread':
        break;
    }
  }

  // ───────────── 畫面 ─────────────

  private back(label = '回主畫面'): Choice {
    return { label, run: () => (this.screen = this.home) };
  }

  private toSuru(label = '回 Suru'): Choice {
    return { label, run: () => (this.screen = this.suru) };
  }

  private costTag(cost: number): string {
    return cost > 0 ? `（-${cost}%）` : '';
  }

  private home = (): Choice[] => {
    const m = this.engine.menu(this.state);
    const list: Choice[] = [{ label: '打開 App', run: () => (this.screen = this.apps) }];
    if (m.threads.length) {
      const waiting = m.replies.length + this.state.awaiting.filter((id) => !m.replies.some((r) => r.event === id)).length;
      list.push({ label: `看聊天室${waiting ? `（有 ${waiting} 則訊息等你回）` : ''}`, run: () => (this.screen = this.threads) });
    }
    for (const l of m.locate) {
      list.push({ label: `用「${this.appName(l.app)}」定位${this.costTag(l.cost)}`, run: () => this.act({ type: 'locate', app: l.app }) });
    }
    return list;
  };

  private appName(id: string): string {
    return this.content.apps.apps.find((a) => a.id === id)?.name ?? id;
  }

  private apps = (): Choice[] => {
    const m = this.engine.menu(this.state);
    return [
      ...m.apps.map((a) => {
        // 開局時 App 上的未讀標示，打開過就不再顯示
        const badge = a.opened ? undefined : this.content.apps.apps.find((x) => x.id === a.app)?.badge;
        return { label: `${this.appName(a.app)}${badge ? `［${badge}］` : ''}${this.costTag(a.cost)}`, run: () => this.openApp(a.app) };
      }),
      this.back(),
    ];
  };

  private openApp(id: string) {
    const app = this.content.apps.apps.find((a) => a.id === id);
    if (!app) return;
    this.say('', `── ${app.name} ──`);
    const outcomes = this.act({ type: 'openApp', app: id });
    // 視窗不擋操作：就算這一步剛好跳出視窗，內容照樣顯示
    if (outcomes.some((o) => o.kind === 'invalid') || this.state.phase === 'ended') return;
    if (app.view === 'chat') this.screen = this.threads;
    else if (app.view === 'assistant') this.screen = this.suru;
    else if (app.view === 'contacts') this.cast();
    else if (app.view === 'none' || app.view === 'utility') this.say(app.emptyText ?? '（這裡沒有她留下的東西。）');
    else {
      const visible = this.content.items.filter((i) => i.app === id && !i.thread && this.shown(i.id));
      for (const item of visible) this.detail(item);
      // 有照片的 App 停在裡面，讓玩家可以一張一張點開
      if (visible.some((i) => i.image)) {
        this.say('', '（照片可以點開看。）');
        this.screen = () => this.appScreen(id);
      }
    }
  }

  /** 已經出現在玩家眼前的 item（含照片還沒點開的） */
  private shown(id: string): boolean {
    return this.state.seen.includes(id) || this.state.unopened.includes(id);
  }

  private photoChoice(item: Item): Choice {
    const opened = this.state.viewedImages.includes(item.id);
    return {
      label: `看照片「${item.image?.label ?? '照片'}」${item.when ? `（${item.when}）` : ''}${opened ? '［看過］' : ''}`,
      run: () => this.act({ type: 'viewImage', item: item.id }),
    };
  }

  private appScreen(id: string): Choice[] {
    const photos = this.content.items.filter((i) => i.app === id && !i.thread && i.image && this.shown(i.id));
    return [...photos.map((i) => this.photoChoice(i)), { label: '回 App 列表', run: () => (this.screen = this.apps) }, this.back()];
  }

  private threads = (): Choice[] => {
    const m = this.engine.menu(this.state);
    return [
      ...m.threads.map((t) => {
        const waiting = this.state.awaiting.some((id) => {
          const e = this.content.events.find((x) => x.id === id);
          return e?.kind === 'message' && e.thread === t.thread;
        });
        const fresh = this.state.threads[t.thread]?.appended.length ?? 0;
        const tag = [t.read ? '' : '未讀', fresh ? `新訊息 ${fresh}` : '', waiting ? '等你回' : ''].filter(Boolean).join('、');
        return {
          label: `${this.threadTitle(t.thread)}${tag ? `［${tag}］` : ''}${this.costTag(t.cost)}`,
          run: () => this.openThread(t.thread),
        };
      }),
      this.back(),
    ];
  };

  private openThread(id: string) {
    const first = !this.state.readThreads.includes(id);
    this.say('', `── ${this.threadTitle(id)} ──`);
    const thread = this.content.threads.find((t) => t.id === id);
    const line = (m: Message | AppendedMessage, when: string) => {
      const texts = Array.isArray(m.text) ? m.text : m.text ? [m.text] : [];
      for (const t of texts) this.say(`${when}${this.name(m.from)}：${t}`);
      if (m.image) this.say(`${when}${this.name(m.from)}：${this.photoTag(m.image)}`);
      if ('signal' in m) this.say(...this.signal(m.signal));
    };
    // 舊訊息只在第一次讀的時候整段印出來，之後只印開局後的新訊息
    if (first) for (const m of thread?.history ?? []) line(m, `${m.when}　`);
    else this.say('（舊訊息略）');
    for (const m of this.state.threads[id]?.appended ?? []) line(m, '');
    if ([...(thread?.history ?? []), ...(this.state.threads[id]?.appended ?? [])].some((m) => m.image)) this.say('', '（照片可以點開看。）');
    const outcomes = this.act({ type: 'readThread', thread: id });
    // 視窗不擋操作：就算這一步剛好跳出視窗，內容照樣顯示
    if (outcomes.some((o) => o.kind === 'invalid') || this.state.phase === 'ended') return;
    this.screen = () => this.threadScreen(id);
  }

  private threadScreen(id: string): Choice[] {
    const m = this.engine.menu(this.state);
    const list: Choice[] = [];
    // 聊天室裡的人，個人頁面上有東西可看的
    const members = this.content.threads.find((t) => t.id === id)?.members ?? [];
    for (const p of m.profiles.filter((x) => members.includes(x.character))) {
      list.push({ label: '看' + this.name(p.character) + '的個人頁面', run: () => void this.act({ type: 'viewProfile', character: p.character }) });
    }
    for (const r of m.replies.filter((x) => x.thread === id)) {
      const e = this.content.events.find((x) => x.id === r.event);
      if (e?.kind !== 'message') continue;
      for (const o of e.options ?? []) {
        list.push({
          label: `回${this.name(e.from)}「${e.text[e.text.length - 1]}」：${o.text}${this.costTag(r.cost)}`,
          run: () => this.act({ type: 'reply', event: e.id, option: o.id }),
        });
      }
    }
    // 這個聊天室裡的照片：有對應 item 的走規則（點開才可能算看過），其餘只是看一眼
    const thread = this.content.threads.find((t) => t.id === id);
    for (const msg of thread?.history ?? []) {
      if (!msg.image) continue;
      const item = msg.item ? this.item(msg.item) : undefined;
      if (item?.image) list.push(this.photoChoice(item));
      else {
        const image = msg.image;
        list.push({ label: `看照片「${image.label ?? '照片'}」（${msg.when}）`, run: () => this.showPhoto(image) });
      }
    }
    for (const msg of this.state.threads[id]?.appended ?? []) {
      const image = msg.image;
      if (image) list.push({ label: `看照片「${image.label ?? '照片'}」`, run: () => this.showPhoto(image) });
    }
    list.push({ label: '回聊天室列表', run: () => (this.screen = this.threads) }, this.back());
    return list;
  }

  private suru = (): Choice[] => {
    const m = this.engine.menu(this.state);
    const list: Choice[] = [
      { label: '時間軸', run: () => this.showTimeline() },
      { label: '紀錄', run: () => this.showList('紀錄', memo(this.content, this.state).records) },
      { label: '說法', run: () => this.showList('說法', memo(this.content, this.state).statements) },
      { label: '疑點', run: () => this.showCards() },
    ];
    if (m.concerns.length) list.push({ label: `在意的地方（${m.concerns.length}）`, run: () => (this.screen = this.concernList) });
    if (m.thoughts.some((t) => t.more)) list.push({ label: '提示（挑一個疑點）', run: () => (this.screen = this.thinkList) });
    // 疑點、拿疑點去試探人、指認兇手都收在助理 App 裡，主畫面不放
    if (m.tests.length) list.push({ label: '試探某個人（拿疑點去問）', run: () => (this.screen = this.probeWho) });
    if (m.challenge) list.push({ label: '指認兇手', run: () => this.startChallenge() });
    list.push(this.back());
    return list;
  };

  // 提示（規則裡的動作叫 think）：挑一個疑點，一次給一句。還在「在意的地方」階段的不顯示疑點標題（標題會洩漏答案），顯示那一筆資料
  private thinkList = (): Choice[] => {
    const m = this.engine.menu(this.state);
    return [
      ...m.thoughts
        .filter((t) => t.more)
        .map((t) => {
          const card = this.content.cards.find((c) => c.id === t.card);
          const spot = card ? spotOf(card) : null;
          const item = t.concern && spot ? this.item(spot.item) : undefined;
          const name = item ? '在意的地方：' + this.label(item) : (card?.title ?? t.card);
          return { label: name + (t.cost ? '（-' + t.cost + '%）' : ''), run: () => void this.act({ type: 'think', card: t.card }) };
        }),
      this.toSuru(),
    ];
  };

  // 在意的地方：助理只指出是哪一筆，玩家要說出哪裡有問題
  private concernList = (): Choice[] => {
    const m = this.engine.menu(this.state);
    return [
      ...m.concerns.flatMap((c) => {
        const item = this.item(c.item);
        return item ? [{ label: this.label(item), run: () => this.openConcern(c.card) }] : [];
      }),
      this.toSuru(),
    ];
  };

  private openConcern(cardId: string) {
    const card = this.content.cards.find((c) => c.id === cardId);
    const spot = card ? spotOf(card) : null;
    const item = spot ? this.item(spot.item) : undefined;
    if (!spot || !item) return;
    this.say('');
    this.detail(item);
    if (item.image && this.state.viewedImages.includes(item.id)) this.say(`　${item.image.description}`);
    if (spot.prompt) this.say('', spot.prompt);
    this.screen = () => {
      const c = this.engine.menu(this.state).concerns.find((x) => x.card === cardId);
      if (!c) return this.suru();
      return [
        ...spot.options
          .filter((o) => c.options.includes(o.id))
          .map((o) => ({ label: `${o.text}${c.missCost ? `（指錯 -${c.missCost}%）` : ''}`, run: () => this.act({ type: 'spot', card: cardId, option: o.id }) })),
        { label: '先不回答', run: () => (this.screen = this.concernList) },
      ];
    };
  }

  private showList(title: string, items: Item[]) {
    this.say('', `── ${title} ──`);
    if (items.length === 0) this.say('（還沒有東西）');
    for (const item of items) this.say(`・${this.label(item)}`);
  }

  private showTimeline() {
    const rows = memo(this.content, this.state).timeline;
    this.say('', '── 時間軸 ──');
    if (rows.length === 0) this.say('（還沒有東西）');
    // 時段當小標題，同一個時段只印一次
    let label = '';
    for (const row of rows) {
      if (row.label !== label) this.say('【' + row.label + '】');
      label = row.label;
      this.say('・' + row.text);
    }
  }

  private showCards() {
    this.say('', '── 疑點 ──');
    if (this.state.cards.length === 0) this.say('（還沒有疑點。Suru 會記下「在意的地方」，指出哪裡有問題，就會成為疑點。疑點可以拿去試探人。）');
    for (const id of this.state.cards) {
      const card = this.content.cards.find((c) => c.id === id);
      if (!card) continue;
      this.say('・' + card.title + (card.say ? '：「' + card.say + '」' : '（不能拿去問人，只能看提示）'));
      for (const line of (card.hints ?? []).slice(0, this.state.hints[id] ?? 0)) this.say('　　……' + line);
    }
  }

  // 試探：先選人，再選要對他說哪一句（每一句背後是一個疑點）
  private probeWho = (): Choice[] => {
    const m = this.engine.menu(this.state);
    const people = this.content.characters.map((c) => c.id).filter((id) => m.tests.some((t) => t.targets.includes(id)));
    return [...people.map((id) => ({ label: this.name(id), run: () => (this.screen = () => this.probeWhat(id)) })), this.toSuru()];
  };

  private probeWhat(target: string): Choice[] {
    const m = this.engine.menu(this.state);
    return [
      ...m.tests
        .filter((t) => t.targets.includes(target))
        .flatMap((t) => {
          const card = this.content.cards.find((c) => c.id === t.card);
          if (!card) return [];
          const room = this.content.threads.find((x) => x.id === t.threadOf[target]);
          const where = room && room.members.length > 1 ? `在「${this.threadTitle(room.id)}」裡問` : '私訊';
          return [
            {
              label: `「${card.sayTo?.[target] ?? card.say}」（${card.title}，${where}）${this.costTag(t.cost)}`,
              run: () => {
                this.say('');
                this.screen = this.suru;
                this.act({ type: 'test', card: t.card, target });
              },
            },
          ];
        }),
      { label: '換一個人', run: () => (this.screen = this.probeWho) },
    ];
  }

  private startChallenge() {
    if (this.engine.menu(this.state).challenge?.form) this.formChallenge(true);
    else this.askChallenge(true);
  }

  // 一次交卷：每一格放一張疑點，全部填好才交出去；填的時候不說對錯，可以隨意換
  private formChallenge(entering: boolean) {
    const ch = this.content.endings.challenge;
    const cardTitle = (id: string) => this.content.cards.find((c) => c.id === id)?.title ?? id;
    const promptOf = (q: string) => (q === 'who' ? ch.whoPrompt : (ch.fields.find((f) => f.id === q)?.prompt ?? q));
    const shown = (q: string, answer: string | null) => (answer === null ? '（還沒填）' : q === 'who' ? this.name(answer) : cardTitle(answer));
    if (entering) this.say('', '── 指認兇手 ──', ...(ch.premise ?? []), ...(ch.intro ?? []));
    this.screen = () => {
      const form = this.engine.menu(this.state).challenge?.form;
      if (!form) return this.suru();
      if (form.passed) {
        this.askChallenge(false);
        return this.screen();
      }
      const list: Choice[] = form.slots.map((slot) => ({
        label: promptOf(slot.question) + ' → ' + shown(slot.question, slot.answer),
        run: () => {
          this.say('', promptOf(slot.question));
          this.screen = () => [
            ...slot.options.map((id) => ({
              label: slot.question === 'who' ? this.name(id) : cardTitle(id),
              run: () => {
                this.act({ type: 'fillChallenge', question: slot.question, answer: id });
                this.formChallenge(false);
              },
            })),
            { label: '先不填這一格', run: () => this.formChallenge(false) },
          ];
        },
      }));
      if (form.ready) {
        list.push({
          label: '交出去' + (form.retryCost ? '（被退回 -' + form.retryCost + '%）' : ''),
          run: () => {
            this.act({ type: 'submitChallenge' });
            if (this.state.phase !== 'ended' && this.state.prompt) this.screen = this.home;
          },
        });
      }
      list.push(this.toSuru('先不指認'));
      return list;
    };
  }

  // 一題一題問：題目照資料檔原文印出來，答對才問下一題；離開後再進來從同一題繼續
  private askChallenge(entering: boolean) {
    const ch = this.content.endings.challenge;
    const ask = this.engine.menu(this.state).challenge?.ask;
    if (!ask) return;
    if (entering) {
      const fresh = this.state.accusation.step === 0 && Object.keys(this.state.accusation.tried).length === 0;
      this.say('', '── 指認兇手 ──', ...(fresh ? (ch.intro ?? []) : ['（從上次問到的地方接下去。）']));
    }
    const answer = (value: string) => {
      this.act(ask.question === null ? { type: 'handOver', givenTo: value } : { type: 'answerChallenge', answer: value });
      if (this.state.phase === 'ended') return;
      if (this.state.prompt) this.screen = this.home;
      else this.askChallenge(false);
    };
    const leave = this.toSuru(ask.question === null ? '先不交' : '先不指認');
    if (ask.question === null) {
      this.say('', '證據要交給誰？交出去就不能收回。');
      this.screen = () => [...ask.options.map((id) => ({ label: `把證據交給${this.name(id)}`, run: () => answer(id) })), leave];
    } else if (ask.question === 'who') {
      this.say('', ch.whoPrompt);
      this.screen = () => [...ask.options.map((id) => ({ label: this.name(id), run: () => answer(id) })), leave];
    } else {
      const field = ch.fields.find((f) => f.id === ask.question);
      this.say('', field?.prompt ?? '');
      this.say(ask.options.length ? `（從手上的疑點裡選一張${ask.retryCost ? `，選錯 -${ask.retryCost}%` : ''}）` : '（手上的疑點都試過了。先去找找別的。）');
      this.screen = () => [
        ...ask.options.map((id) => ({ label: this.content.cards.find((c) => c.id === id)?.title ?? id, run: () => answer(id) })),
        leave,
      ];
    }
  }
}
