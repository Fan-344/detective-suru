// 遊戲規則的對外入口。文字版、自動檢查、之後的畫面版都從這裡引用。
export { createEngine, endingText, isRightSpot, isSolvedEnding, isWeakEnding, spotOf, type Engine, type Spot } from './engine';
export { memo, reachedConclusions, routesReached, type Memo } from './memo';
export { DEFAULT_RULES, type Action, type AppendedMessage, type GameState, type Menu, type Outcome, type Rules, type StepResult } from './types';
