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

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

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
