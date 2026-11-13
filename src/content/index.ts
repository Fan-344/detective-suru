// 內容載入器。把 content/<case>/ 底下的 JSON 檔收齊、檢查、交出去。
// 不引用任何畫面相關的東西，engine、文字版、畫面版都從這裡拿內容。

import { assembleCase, CASE_FILES, type CaseFileName, type RawCase } from './validate';
import type { CaseContent } from './types';

export * from './types';
export { parseWhen, type ParsedWhen } from './when';
export { assembleCase, validateCase, formatIssues, ContentError, CASE_FILES, type Issue, type RawCase } from './validate';

// 建置時由 Vite 把資料檔打包進來，所以執行時不需要讀檔，也沒有後端。
const modules = import.meta.glob<unknown>('../../content/*/*.json', { eager: true, import: 'default' });

/** 目前有哪些案件的資料夾 */
export function listCases(): string[] {
  const ids = new Set<string>();
  for (const path of Object.keys(modules)) {
    const m = /content\/([^/]+)\/[^/]+\.json$/.exec(path);
    if (m) ids.add(m[1]);
  }
  return [...ids].sort();
}

/** 收齊某個案件的原始 JSON，還沒檢查 */
export function readRawCase(caseId: string): RawCase {
  const raw: RawCase = {};
  for (const [path, value] of Object.entries(modules)) {
    const m = /content\/([^/]+)\/([^/]+)\.json$/.exec(path);
    if (!m || m[1] !== caseId) continue;
    if ((CASE_FILES as readonly string[]).includes(m[2])) raw[m[2] as CaseFileName] = value;
  }
  return raw;
}

/** 載入並檢查。有問題會丟出 ContentError，訊息裡列出每一個問題在哪個檔的哪一筆。 */
export function loadCase(caseId: string): CaseContent {
  return assembleCase(readRawCase(caseId));
}
