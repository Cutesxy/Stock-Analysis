// 持仓视图:仓位维护 + 账户收益曲线 + 流水
import { store } from '../store.js';
import { drawCurve } from '../charts.js';
import { toast, openTradeModal } from '../ui.js';
import { ledger, exportJSON } from '../ledger.js';
import { fmt } from '../config.js';

const $ = id => document.getElementById(id);

// 账户净值序列:按日回放流水(价格取当日收盘,当日无价用前值)
function equitySeries(D, rows, live) {
  const pd = Object.fromEntries(D.dividend.daily);
  const pg = Object.fromEntries(D.games.daily);
  const days = D.games.daily.map(r => r[0]);
  const start = days[0];
  const evs = [...rows].sort((a, b) => (a.date < b.date ? -1 : 1));
  let sh = { dividend: 0, games: 0 }, cash = 0, dep = 0, ei = 0;
  const apply = r => {
    if (r.act === '入金') { cash += r.shares; dep += r.shares; return; }
    if (r.etf === 'cash') return;
    if (r.act === '买入') { sh[r.etf] += r.shares; cash -= r.price * r.shares + (r.fee || 0); }
    else if (r.act === '卖出') { sh[r.etf] -= r.shares; cash += r.price * r.shares - (r.fee || 0); }
    else if (r.act === '分红') { cash += r.price * r.shares; }
  };
  while (ei < evs.length && evs[ei].date < start) { apply(evs[ei]); ei++; }
  let lastD = null, lastG = null;
  const val = [], depS = [];
  for (const d of days) {
    while (ei < evs.length && evs[ei].date <= d) { apply(evs[ei]); ei++; }
    if (pd[d] != null) lastD = pd[d];
    if (pg[d] != null) lastG = pg[d];
    if (lastD == null || lastG == null) { val.push(null); depS.push(dep); continue; }
    val.push(cash + sh.dividend * lastD + sh.games * lastG);
    depS.push(dep);
  }
  // 补今天实时
  if (live && live.games && live.dividend) {
    const today = new Date().toISOString().slice(0, 10);
    if (days[days.length - 1] !== today) {
      val.push(cash + sh.dividend * live.dividend.price + sh.games * live.games.price);
      depS.push(dep);
      days.push(today);
    }
  }
  const pts = days.map((d, i) => [d, val[i]]);
  const depPts = days.map((d, i) => [d, depS[i]]);
  return { pts: pts.filter(p => p[1] != null), depPts };
}

export function renderPositions(root) {
  const s = store.state;
  const D = s.D, L = s.L, live = s.liveOk ? s.live : null;
  const h = s.h, g = s.g;
  const dVal = L.dividend.sh * h, gVal = L.games.sh * g;
  const tot = dVal + gVal + L.cash;
  const rw = D.stats.rec_weights;

  const pl = (pnl, pct) => `<span class="${pnl >= 0 ? 'up' : 'down'}">${fmt.pct(pct)} · ${pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}元</span>`;

  let html = '';
  if (!s.ledger.length) {
    html += `<div class="hero"><h3>记录你的第一笔交易</h3>
      <p>先记一笔[入金](现金),再记录买入——持仓、加权成本、止盈线、胜率全部自动联动。</p>
      <div class="btns"><button onclick="openTradeModal({etf:'cash',act:'入金'})">＋ 记一笔入金</button>
      <button class="ghost" onclick="loadDemoFlow()">载入演示数据</button></div></div>`;
  }
  // 持仓卡(带快捷操作)
  const posCard = (name, key, val, sh, cost, px) => `
    <div class="pf-item"><div class="t"><span>${name}</span>
      <span class="qbtns">
        <button class="buy" onclick="openTradeModal({etf:'${key}',act:'买入'})">买</button>
        <button class="sell" onclick="openTradeModal({etf:'${key}',act:'卖出'})">卖</button>
        <button class="ghost" onclick="openTradeModal({etf:'${key}',act:'分红'})">息</button></span></div>
    <div class="v">${fmt.money(val)}</div>
    <div class="mini">${sh}股@${cost.toFixed(4)} · 浮盈 ${sh ? pl((px - cost) * sh, (px / cost - 1) * 100) : '—'}</div></div>`;
  html += `<div class="pf-grid">` +
    posCard(D.symbols.dividend.name, 'dividend', dVal, L.dividend.sh, L.dividend.cost, h) +
    posCard(D.symbols.games.name, 'games', gVal, L.games.sh, L.games.cost, g) +
    `<div class="pf-item"><div class="t"><span>现金</span>
      <span class="qbtns"><button class="ghost" onclick="openTradeModal({etf:'cash',act:'入金'})">入金</button></span></div>
    <div class="v">${fmt.money(L.cash)}</div>
    <div class="mini">已实现盈亏 ${L.realized >= 0 ? '+' : ''}${L.realized.toFixed(0)}元</div></div>` +
    `<div class="pf-item"><div class="t"><span>总资产</span></div><div class="v">${fmt.money(tot)}</div>
    <div class="mini">${tot > 0 ? `压舱${(dVal / tot * 100).toFixed(0)}% / 进攻${(gVal / tot * 100).toFixed(0)}% / 现金${(L.cash / tot * 100).toFixed(0)}%` : '记入流水后显示'}<br>推荐:压舱${(rw.dividend * 100).toFixed(0)}%/进攻${(rw.games * 100).toFixed(0)}%/现金${(rw.cash * 100).toFixed(0)}%</div></div></div>`;

  // 配置对比条
  if (tot > 0) {
    const w = { d: dVal / tot * 100, g: gVal / tot * 100, c: L.cash / tot * 100 };
    html += `<div class="panel"><h2>配置结构 <span class="mini">当前 vs 推荐</span></h2>
      <div class="wbar"><div style="width:${w.d}%;background:#1666dc"></div><div style="width:${w.g}%;background:#d9a123"></div><div style="width:${w.c}%;background:#b3bdc9"></div></div>
      <div class="wlegend">
      <span><span class="dotc" style="background:#1666dc"></span>压舱 <b>${w.d.toFixed(0)}%</b>(推荐${(rw.dividend * 100).toFixed(0)}%)</span>
      <span><span class="dotc" style="background:#d9a123"></span>进攻 <b>${w.g.toFixed(0)}%</b>(推荐${(rw.games * 100).toFixed(0)}%)</span>
      <span><span class="dotc" style="background:#b3bdc9"></span>现金 <b>${w.c.toFixed(0)}%</b>(推荐${(rw.cash * 100).toFixed(0)}%)</span>
      <span style="margin-left:auto">${w.g < rw.games * 100 - 5 ? '⬆️进攻仓欠配——两档条件单成交即到位' : (w.g > rw.games * 100 + 5 ? '⬇️进攻仓超配' : '✅配置在推荐区间')}</span></div></div>`;
  }

  // 收益曲线
  if (s.ledger.length) {
    const { pts, depPts } = equitySeries(D, s.ledger, live);
    const lastV = pts.length ? pts[pts.length - 1][1] : 0;
    const lastDep = depPts.length ? depPts[depPts.length - 1][1] : 0;
    const pnlPct = lastDep > 0 ? (lastV / lastDep - 1) * 100 : 0;
    html += `<div class="panel"><h2>账户收益曲线 <span class="mini">(按流水逐日回放 · 相对累计入金)</span></h2>
      <div class="big"><div class="kv"><div class="k">累计入金</div><div class="v">${fmt.money(lastDep)}</div></div>
      <div class="kv"><div class="k">当前净值</div><div class="v">${fmt.money(lastV)}</div></div>
      <div class="kv"><div class="k">总收益</div><div class="v ${pnlPct >= 0 ? 'up' : 'down'}">${fmt.pct(pnlPct)}</div></div></div>
      <div class="chartbox" id="ch-equity"></div></div>`;
  }

  // 流水表
  const names = { dividend: D.symbols.dividend.name.split(' ')[0], games: D.symbols.games.name.split(' ')[0], cash: '现金' };
  html += `<div class="panel"><h2>交易流水 <span class="mini">(SQLite本地库 · 全部计算自动)</span></h2>
    <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
    <button onclick="openTradeModal()">＋ 记一笔</button>
    <button class="ghost sm" onclick="exportLedgerFlow()">导出备份</button>
    <button class="ghost sm" onclick="document.getElementById('imp').click()">导入</button>
    <button class="ghost sm" onclick="loadDemoFlow()">载入演示</button>
    <button class="ghost sm" onclick="clearLedgerFlow()">清空</button>
    <input type="file" id="imp" accept=".json" style="display:none" onchange="importLedgerFlow(this)">
    <span class="mini" id="cash-warn">${L.cash < 0 ? '⚠️现金为负:流水不完整,检查入金/卖出是否漏记' : ''}</span></div>
    <table id="ledger-table"><tr><th>日期</th><th>标的</th><th>动作</th><th>价格</th><th>股数/金额</th><th>费</th><th>备注</th><th></th></tr>`;
  const rev = [...s.ledger].reverse();
  if (!rev.length) html += `<tr><td colspan="8" class="mini">空</td></tr>`;
  for (const r of rev) {
    const chipCls = r.act === '买入' ? 'buy' : (r.act === '卖出' ? 'sell' : (r.act === '分红' ? 'div' : 'cash'));
    html += `<tr><td>${r.date}</td><td>${names[r.etf] || r.etf}</td>
      <td><span class="chip ${chipCls}">${r.act}</span></td>
      <td>${r.act === '入金' ? '—' : r.price}</td><td>${r.shares}</td><td>${r.fee || 0}</td>
      <td class="mini">${r.note || ''}</td>
      <td><span class="del" style="color:#64748b;cursor:pointer" onclick="delLedgerFlow('${r.id}')">✕</span></td></tr>`;
  }
  html += `</table></div>`;
  root.innerHTML = html;

  // 曲线
  if (s.ledger.length) {
    const { pts, depPts } = equitySeries(D, s.ledger, live);
    drawCurve('ch-equity', {
      series: [
        { name: '账户净值', color: '#1666dc', points: pts, width: 2 },
        { name: '累计入金', color: '#98a2b3', points: depPts, dash: '5 4' },
      ],
      base: depPts.length ? depPts[depPts.length - 1][1] : null,
      baseLabel: '累计入金',
      yfmt: v => v >= 10000 ? (v / 10000).toFixed(1) + '万' : v.toFixed(0),
      tipFmt: v => v.toFixed(0) + '元',
    });
  }
}

window.exportLedgerFlow = () => exportJSON(ledger.rows);
window.importLedgerFlow = async inp => {
  const f = inp.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = async () => {
    try {
      const rows = JSON.parse(rd.result);
      if (Array.isArray(rows)) { await ledger.replace(rows); store.set({ ledger: rows }); toast('导入成功'); }
      else toast('格式不对', 'err');
    } catch (e) { toast('解析失败', 'err'); }
  };
  rd.readAsText(f); inp.value = '';
};
window.delLedgerFlow = async id => {
  await ledger.remove(id);
  store.set({ ledger: ledger.rows });
  toast('已删除');
};
window.clearLedgerFlow = async () => {
  if (!confirm('清空全部流水?此操作不可撤销(建议先导出备份)')) return;
  await ledger.replace([]);
  store.set({ ledger: [] });
  toast('已清空');
};
