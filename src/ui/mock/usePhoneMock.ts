import { useEffect, useMemo, useRef, useState } from 'react';
import { clampBattery } from '../format';
import type { IntroSegment, Nav, PhoneActions, PhoneData } from '../types';
import type { SuruDemo } from '../suru/Showcase';
import raw from './fixture.json';

// 外觀框架專用的假控制器：只為了讓畫面能動起來給人看。
// 這裡沒有任何遊戲規則（不扣電、沒有階梯）。步驟三會整個換成接 engine 的版本。

interface Fixture {
  startBattery: number;
  mockReplyText: string;
  mockReplyTime: string;
  afterIntro: Nav;
  wander: { after: number; hints: string[] };
  accuseResult: string;
  intro: IntroSegment[];
  introTitle: string;
  suruDemo: SuruDemo;
  phone: PhoneData;
}

const fixture = raw as unknown as Fixture;

export type Stage = 'intro' | 'phone' | 'dead';

export function usePhoneMock() {
  const [stage, setStage] = useState<Stage>('intro');
  const [battery, setBatteryRaw] = useState(fixture.startBattery);
  const [data, setData] = useState<PhoneData>(fixture.phone);
  const [run, setRun] = useState(0);
  const timers = useRef<number[]>([]);
  // 連續打開了幾個背景 App、已經提醒過幾次。只是示範用的計數，正式規則在 engine
  const wander = useRef({ streak: 0, shown: 0 });

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  // 示範用：進到手機畫面幾秒後，有一句新的心聲以通知的樣子跳出來
  useEffect(() => {
    if (stage !== 'phone') return;
    const timer = window.setTimeout(() => {
      setData((d) => {
        const line = d.suru.voice.find((v) => v.isNew);
        return line && !d.notice ? { ...d, notice: { id: Date.now(), text: line.text } } : d;
      });
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [stage, run]);

  const patchThread = (id: string, patch: (t: PhoneData['threads'][number]) => PhoneData['threads'][number]) =>
    setData((d) => ({ ...d, threads: d.threads.map((t) => (t.id === id ? patch(t) : t)) }));

  const sendAsSelf = (threadId: string, text: string) => {
    const stamp = Date.now();
    patchThread(threadId, (t) => {
      const lastDay = t.messages[t.messages.length - 1]?.day ?? fixture.mockReplyTime;
      const replier = t.members[0];
      return {
        ...t,
        prefill: undefined,
        options: undefined,
        readAt: undefined,
        typing: replier?.id,
        messages: [
          ...t.messages,
          { id: `mine-${stamp}`, from: fixture.phone.selfId, day: lastDay, time: fixture.mockReplyTime, text },
        ],
      };
    });
    const timer = window.setTimeout(() => {
      patchThread(threadId, (t) => {
        const replier = t.members[0];
        if (!replier) return { ...t, typing: undefined };
        const lastDay = t.messages[t.messages.length - 1]?.day ?? fixture.mockReplyTime;
        return {
          ...t,
          typing: undefined,
          messages: [
            ...t.messages,
            { id: `reply-${stamp}`, from: replier.id, day: lastDay, time: fixture.mockReplyTime, text: fixture.mockReplyText },
          ],
        };
      });
    }, 1400);
    timers.current.push(timer);
  };

  const actions: PhoneActions = useMemo(
    () => ({
      onOpenThread: (id) => patchThread(id, (t) => ({ ...t, unread: 0 })),
      onChooseReply: (threadId, optionId) => {
        const option = data.threads.find((t) => t.id === threadId)?.options?.find((o) => o.id === optionId);
        if (option) sendAsSelf(threadId, option.text);
      },
      onSendPrefill: (threadId) => {
        const text = data.threads.find((t) => t.id === threadId)?.prefill;
        if (text) sendAsSelf(threadId, text);
      },
      onOpenApp: (appId) => {
        const opened = data.apps.find((a) => a.id === appId);
        if (!opened?.background) {
          wander.current.streak = 0;
          return;
        }
        wander.current.streak += 1;
        if (wander.current.streak < fixture.wander.after || fixture.wander.hints.length === 0) return;
        wander.current.streak = 0;
        const text = fixture.wander.hints[wander.current.shown % fixture.wander.hints.length];
        wander.current.shown += 1;
        setData((d) => ({ ...d, notice: { id: wander.current.shown, text } }));
      },
      // 示範用：任何答案都接受並往下一題；全部答完跳一句佔位的結果，再從頭開始
      onViewImage: () => {},
      onSeeMessages: () => {},
      onViewProfile: () => {},
      onSpot: () => {},
      onProbe: () => {},
      onThink: () => {},
      onCall: () => {},
      onNavigate: () => {},
      onAccuseAnswer: (_stepId, value) =>
        setData((d) => {
          // 用紀錄回答的題目，上方顯示那筆紀錄的名稱
          const label = d.suru.records.find((r) => r.id === value)?.title ?? value;
          const answers = [...d.suru.accuse.answers, label];
          const done = answers.length >= d.suru.accuse.steps.length;
          return {
            ...d,
            suru: { ...d.suru, accuse: { ...d.suru.accuse, answers: done ? [] : answers } },
            notice: done ? { id: Date.now(), text: fixture.accuseResult } : d.notice,
          };
        }),
      onLocate: (deviceId) =>
        setData((d) => ({ ...d, finder: d.finder.map((f) => (f.id === deviceId ? { ...f, located: true } : f)) })),
      onDismissNotice: () => setData((d) => ({ ...d, notice: undefined })),
      onOpenSuru: () =>
        setData((d) => ({
          ...d,
          apps: d.apps.map((a) => (a.layout === 'suru' ? { ...a, unread: 0 } : a)),
          suru: { ...d.suru, voice: d.suru.voice.map((v) => ({ ...v, isNew: false })) },
        })),
      onOpenRow: (appId, rowId) =>
        setData((d) => {
          const groups = d.lists[appId];
          if (!groups) return d;
          let cleared = 0;
          const next = groups.map((g) => ({
            ...g,
            rows: g.rows.map((r) => {
              if (r.id !== rowId || !r.unread) return r;
              cleared += 1;
              return { ...r, unread: false };
            }),
          }));
          if (!cleared) return d;
          return {
            ...d,
            lists: { ...d.lists, [appId]: next },
            apps: d.apps.map((a) => (a.id === appId ? { ...a, unread: Math.max(0, (a.unread ?? 0) - 1) } : a)),
          };
        }),
    }),
    [data],
  );

  const setBattery = (value: number) => {
    const v = clampBattery(value);
    setBatteryRaw(v);
    if (v <= 0) setStage((s) => (s === 'phone' ? 'dead' : s));
  };

  const restart = () => {
    clearTimers();
    wander.current = { streak: 0, shown: 0 };
    setData(fixture.phone);
    setBatteryRaw(fixture.startBattery);
    setStage('intro');
    setRun((n) => n + 1);
  };

  return {
    stage,
    run,
    battery,
    startBattery: fixture.startBattery,
    data,
    actions,
    intro: fixture.intro,
    introTitle: fixture.introTitle,
    suruDemo: fixture.suruDemo,
    afterIntro: fixture.afterIntro,
    finishIntro: () => setStage('phone'),
    showVoice: () =>
      setData((d) => {
        const line = d.suru.voice[0];
        return line ? { ...d, notice: { id: Date.now(), text: line.text } } : d;
      }),
    setBattery,
    restart,
    clearUnread: () =>
      setData((d) => ({
        ...d,
        apps: d.apps.map((a) => ({ ...a, unread: 0 })),
        threads: d.threads.map((t) => ({ ...t, unread: 0 })),
      })),
    resetData: () => setData(fixture.phone),
  };
}
