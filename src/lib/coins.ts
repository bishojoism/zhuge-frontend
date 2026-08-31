// ===== 格币前端工具：等级档位映射（与后端 actions/coins.js 一致） =====
export interface LevelDef {
  level: number;
  min: number; // 累计获得币达到该值升级
}

// 等级档位：Lv.1 起步人人有；等级作为特殊徽章显示（Lv.2 起显示）
export const LEVELS: LevelDef[] = [
  { level: 1, min: 0 },
  { level: 2, min: 100 },
  { level: 3, min: 500 },
  { level: 4, min: 2000 },
  { level: 5, min: 10000 },
  { level: 6, min: 50000 },
];

// 累计获得币 → 等级
export function levelOf(earned?: number | null): number {
  let lv = LEVELS[0];
  for (const l of LEVELS) if ((earned ?? 0) >= l.min) lv = l;
  return lv.level;
}

// 等级显示名（徽章文字）
export function levelLabel(level: number): string {
  return `Lv.${level}`;
}
