// 全局状态存储:单一数据源 + 订阅通知(视图解耦的核心)
export const store = {
  state: {
    D: null,            // /api/data(历史+通道+规则+统计)
    live: null, liveOk: false,   // 实时行情
    ledger: [],          // 流水(来自SQLite)
    done: {},           // 已完成动作标记
    p: 58,              // P(修复)
    view: 'dashboard',
    busy: false,
  },
  subs: new Set(),
  set(patch) { Object.assign(this.state, patch); this.notify(); },
  notify() { for (const f of this.subs) { try { f(this.state); } catch (e) { console.error(e); } } },
  sub(f) { this.subs.add(f); return () => this.subs.delete(f); },
};
