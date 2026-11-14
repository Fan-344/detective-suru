// 文字冒險版的共用部分：把 engine 的狀態變成「一段文字＋幾個編號選項」。
// 終端機（tools/play.ts）和網頁（src/play/web.ts）都用這個，兩邊只負責顯示和收輸入。
// 這裡的字串只有介面用語；劇情文字全部來自資料檔。

import type { CaseContent, ImageRef, Item, Message, Signal } from '../content/types';
import { createEngine, memo, spotOf, voice, type Action, type AppendedMessage, type Engine, type GameState, type Outcome } from '../engine';

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
    if (s.phase === 'ended') return [{ label: '重新開始', run: () => this.restart() }];
    if (s.phase === 'cover') return [{ label: '送出', run: () => this.act({ type: 'sendCover' }) }];
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
      case 'assistantUnread':
        this.say(`　（${this.appName(this.content.apps.apps.find((a) => a.view === 'assistant')?.id ?? '')} 記下了一筆新的東西。）`);
        break;
      case 'link':
        this.say(o.result === 'match' ? '→ 吻合。' : o.result === 'conflict' ? '→ 矛盾。' : '→ 看不出關聯。');
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
          if (f) this.say(`　${f.hint}`);
        }
        break;
      case 'ending': {
        const e = this.content.endings.endings.find((x) => x.id === o.ending);
        if (e) this.say('', `════ 結局：${e.title} ════`, '', ...e.text.flatMap((p) => [p, '']));
        break;
      }
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
      { label: '心聲', run: () => this.showVoice() },
      { label: '時間軸', run: () => this.showTimeline() },
      { label: '紀錄', run: () => this.showList('紀錄', memo(this.content, this.state).records) },
      { label: '說法', run: () => this.showList('說法', memo(this.content, this.state).statements) },
      { label: '疑點', run: () => this.showCards() },
    ];
    if (m.concerns.length) list.push({ label: `在意的地方（${m.concerns.length}）`, run: () => (this.screen = this.concernList) });
    if (m.compare) list.push({ label: '比對一則說法和一筆紀錄', run: () => (this.screen = this.pickStatement) });
    // 疑點、拿疑點去試探人、指認兇手都收在助理 App 裡，主畫面不放
    if (m.tests.length) list.push({ label: '試探某個人（拿疑點去問）', run: () => (this.screen = this.probeWho) });
    if (m.challenge) list.push({ label: '指認兇手', run: () => this.startChallenge() });
    list.push(this.back());
    return list;
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

  private showVoice() {
    this.say('', '── 心聲 ──', ...voice(this.engine, this.state).map((l) => `・${l.text}`));
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
    if (this.state.cards.length === 0) this.say('（還沒有疑點。在備忘錄裡比對出矛盾，或看到某些東西，就會發現。發現的疑點可以拿去試探人。）');
    for (const id of this.state.cards) {
      const card = this.content.cards.find((c) => c.id === id);
      if (card) this.say(`・${card.title}：「${card.say}」`);
    }
    const done = this.state.links.filter((l) => l.result !== 'none');
    if (done.length) this.say('', '比對過的：');
    for (const l of done) {
      const a = this.item(l.statement);
      const b = this.item(l.record);
      if (a && b) this.say(`・${this.label(a)} × ${this.label(b)}　→ ${l.result === 'match' ? '吻合' : '矛盾'}`);
    }
  }

  private pickStatement = (): Choice[] => {
    const m = this.engine.menu(this.state);
    return [
      ...(m.compare?.statements ?? []).flatMap((id) => {
        const item = this.item(id);
        return item ? [{ label: this.label(item), run: () => (this.screen = () => this.pickRecord(id)) }] : [];
      }),
      { label: '回 Suru', run: () => (this.screen = this.suru) },
    ];
  };

  private pickRecord(statement: string): Choice[] {
    const m = this.engine.menu(this.state);
    return [
      ...(m.compare?.records ?? []).flatMap((id) => {
        const item = this.item(id);
        if (!item) return [];
        return [
          {
            label: this.label(item),
            run: () => {
              const a = this.item(statement);
              if (a) this.say('', `比對：${this.label(a)} × ${this.label(item)}`);
              this.act({ type: 'compare', statement, record: id });
              this.screen = this.suru;
            },
          },
        ];
      }),
      { label: '換一則說法', run: () => (this.screen = this.pickStatement) },
    ];
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
          const where = t.thread ? `在「${this.threadTitle(t.thread)}」裡問` : '私訊';
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

  // 推理（資料裡叫挑戰書）：是誰 → 四欄各選紀錄 → 交給誰
  private startChallenge() {
    const ch = this.content.endings.challenge;
    if (this.engine.menu(this.state).challenge?.ask) return this.askChallenge(true);
    // 開頭的說明是劇情文字，從資料檔讀
    this.say('', '── 指認兇手 ──', ...(ch.intro ?? []), '', ch.whoPrompt);
    this.screen = () => [
      ...ch.suspects.map((id) => ({ label: this.name(id), run: () => this.challengeField(id, 0, {}) })),
      this.toSuru('先不指認'),
    ];
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
      this.say(ask.options.length ? `（從看過的紀錄裡選一筆${ask.retryCost ? `，答錯 -${ask.retryCost}%` : ''}）` : '（看過的紀錄都試過了。先去找找別的。）');
      this.screen = () => [
        ...ask.options.flatMap((id) => {
          const item = this.item(id);
          return item ? [{ label: this.label(item), run: () => answer(id) }] : [];
        }),
        leave,
      ];
    }
  }

  private challengeField(accused: string, index: number, fields: Record<string, string[]>) {
    const ch = this.content.endings.challenge;
    const field = ch.fields[index];
    if (!field) {
      this.say('', '證據要交給誰？交出去就不能收回。');
      this.screen = () => [
        ...ch.recipients.map((id) => ({
          label: `把證據交給${this.name(id)}`,
          run: () => {
            this.screen = this.home;
            this.act({ type: 'submitChallenge', accused, fields, givenTo: id });
          },
        })),
        this.toSuru('先不交'),
      ];
      return;
    }
    const max = this.engine.rules.maxPicksPerField;
    this.say('', `${index + 1}. ${field.prompt}`, `（從看過的紀錄裡選，最多 ${max} 筆）`);
    const picked: string[] = [];
    this.screen = () => {
      const records = this.engine.menu(this.state).challenge?.records ?? [];
      const list: Choice[] = [];
      if (picked.length > 0) {
        list.push({ label: `選好了（已選 ${picked.length} 筆）`, run: () => this.challengeField(accused, index + 1, { ...fields, [field.id]: [...picked] }) });
      }
      if (picked.length < max) {
        for (const id of records.filter((r) => !picked.includes(r))) {
          const item = this.item(id);
          if (!item) continue;
          list.push({
            label: this.label(item),
            run: () => {
              picked.push(id);
              this.say(`　已選：${this.label(item)}`);
            },
          });
        }
      }
      list.push(this.toSuru('先不指認'));
      return list;
    };
  }
}
