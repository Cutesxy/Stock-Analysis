// 交易流水引擎:持仓/加权成本/现金/已实现盈亏 + 服务端SQLite同步
import { api } from './api.js';

export const ledger = {
  rows: [],          // [{id,date,etf,act,price,shares,fee,note}]
  async load() { this.rows = (await api.ledger()).rows; },
  async sync() { await api.saveLedger(this.rows); },
  async add(r) { r.id = r.id || 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1e4); this.rows.push(r); await this.sync(); },
  async remove(id) { this.rows = this.rows.filter(x => x.id !== id); await this.sync(); },
  async replace(rows) { this.rows = rows; await this.sync(); },
  async loadDemo() { await api.seedDemo(); await this.load(); },
};

// 计算:持仓股数/加权成本/现金/已实现盈亏
// 卖出按移动加权成本结算,不改剩余持仓成本;分红入现金;入金入现金
export function calc(rows) {
  const pos = { dividend: { sh: 0, inv: 0 }, games: { sh: 0, inv: 0 } };
  let cash = 0, realized = 0;
  for (const r of rows) {
    if (r.act === '入金') { cash += r.shares; continue; }
    if (r.etf === 'cash') continue;
    const p = pos[r.etf];
    if (!p) continue;
    if (r.act === '买入') {
      p.inv += r.price * r.shares + (r.fee || 0);
      p.sh += r.shares;
      cash -= r.price * r.shares + (r.fee || 0);
    } else if (r.act === '卖出') {
      const avg = p.sh > 0 ? p.inv / p.sh : 0;
      cash += r.price * r.shares - (r.fee || 0);
      realized += (r.price - avg) * r.shares - (r.fee || 0);
      p.sh -= r.shares;
      p.inv = p.sh * avg;
    } else if (r.act === '分红') {
      cash += r.price * r.shares;
    }
  }
  const out = { cash, realized };
  for (const k of ['dividend', 'games']) {
    out[k] = { sh: pos[k].sh, cost: pos[k].sh > 0 ? pos[k].inv / pos[k].sh : 0, invested: pos[k].inv };
  }
  return out;
}

export function exportJSON(rows) {
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'etf_ledger_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
}
