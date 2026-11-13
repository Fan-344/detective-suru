// 解析故事內的時間文字（見 types.ts 的 When）。
// 不含任何案件內容：哪幾天、怎麼排，都由 meta.json 的 dayOrder 決定。

export interface ParsedWhen {
  /** 用來排序的值，越小越早 */
  sort: number;
  /** 哪一天，原文（例如「週六」「上週三」「較早」） */
  day: string;
  /** 時刻，原文（例如「18:42」）；只知道哪一天時是 null */
  time: string | null;
  /** 是否為大約的時刻 */
  approx: boolean;
}

const PATTERN = /^(較早|上?週[一二三四五六日])(?: (約)?(\d{1,2}):(\d{2}))?$/;
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const MINUTES_PER_DAY = 24 * 60;

/**
 * 解析失敗時回傳 null。
 * dayOrder 是這個案子裡「本週」各天的先後順序（故事可能跨過週日到下週一）。
 * 「上週X」排在 dayOrder 所有日子之前，「較早」排在最前面。
 */
export function parseWhen(text: string, dayOrder: readonly string[]): ParsedWhen | null {
  const m = PATTERN.exec(text);
  if (!m) return null;
  const [, day, approxMark, hh, mm] = m;

  let dayIndex: number;
  if (day === '較早') {
    dayIndex = -8;
  } else if (day.startsWith('上')) {
    dayIndex = WEEKDAYS.indexOf(day.slice(2)) - 7;
  } else {
    dayIndex = dayOrder.indexOf(day);
    if (dayIndex < 0) return null;
  }

  let minutes = 0;
  let time: string | null = null;
  if (hh !== undefined) {
    const h = Number(hh);
    const min = Number(mm);
    if (h > 23 || min > 59) return null;
    minutes = h * 60 + min;
    time = `${hh.padStart(2, '0')}:${mm}`;
  }

  return { sort: dayIndex * MINUTES_PER_DAY + minutes, day, time, approx: approxMark !== undefined };
}
