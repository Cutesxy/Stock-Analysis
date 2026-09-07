// 前端常量
export const POLL_MS = 30000;          // 行情轮询间隔
export const LS_DONE = 'sa_done_v1';    // 已完成动作标记(localStorage)
export const LS_P = 'sa_p_repair';      // P(修复)滑块值
export const ZONE_CUTS = {              // 资产层分区切点(与后端BACKTEST一致)
  dividend: [-1.0, -0.4, 0.3],
  games: [-1.0, -0.5, 0.0],
};
export const fmt = {
  p: v => (+v).toFixed(3),
  pct: (v, d = 2) => (v > 0 ? '+' : '') + v.toFixed(d) + '%',
  money: v => Math.round(v).toLocaleString('zh-CN') + '元',
  lot: n => Math.max(100, Math.floor(n / 100) * 100),
};
export function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
