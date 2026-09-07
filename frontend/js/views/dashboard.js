// 概览:报价条 → 建议横幅 → 大图表(Tab切换) + 操作面板 → 待办
import { store } from '../store.js';
import { drawChart, drawSpark } from '../charts.js';
import { actRow, sigmaGauge, toast, openTradeModal } from '../ui.js';
import { ledger } from '../ledger.js';
import { api } from '../api.js';
import { fmt } from '../config.js';

const $ = id => document.getElementById(id);
let chartSym = localStorage.getItem('sa_chart_sym') || 'games';
const SYMS = ['dividend', 'games', 'sse'];
if (!SYMS.includes(chartSym)) chartSym = 'games';
window.setChartSym = k => {
  chartSym = k;
  localStorage.setItem('sa_chart_sym', k);
  store.notify();   // 只重渲染,不重算
};

export function renderDashboard(root) {
  const s = store.state;
  const D = s.D;
  const rg = D.rules.games, rd = D.rules.dividend;
  const lastD = k => D[k].daily[D[k].daily.length - 1][1];
  const g = s.liveOk ? s.live.games.price : lastD('games');
  const h = s.liveOk ? s.live.dividend.price : lastD('dividend');
  const ss = s.liveOk ? s.live.sse.price : lastD('sse');
  const L = s.L, done = s.done;
  const chD = s.chD, chG = s.chG;
  const cD = chD.last, cG = chG.last;
  const tp1 = (L.games.cost || 0) * rg.tp1_mult, tp2 = (L.games.cost || 0) * rg.tp2_mult;
  const tranche = L.games.sh > 0 ? fmt.lot(L.games.sh / 3) : 0;

  // ---------- 触发中的动作(用于建议横幅) ----------
  const hot = [];
  if (!done.div_add1 && h <= cD.l15) hot.push(`红利加仓①(${fmt.p(cD.l15)})`);
  if (!done.div_add2 && h <= cD.l2) hot.push(`红利加仓②(${fmt.p(cD.l2)})`);
  if (!done.g_add && g <= rg.adds[0].price) hot.push(`游戏回踩加仓(${rg.adds[0].price})`);
  if (!done.g_break && g >= rg.adds[1].price) hot.push(`游戏追涨档(${rg.adds[1].price})`);
  if (!done.tp1 && tp1 && g >= tp1) hot.push(`止盈①(${fmt.p(tp1)})`);
  if (!done.tp2 && tp2 && g >= tp2) hot.push(`止盈②(${fmt.p(tp2)})`);
  // 距离最近的作战位
  const dists = [
    { lab: `红利加仓① ${fmt.p(cD.l15)}`, d: (cD.l15 / h - 1) * 100 },
    { lab: `游戏回踩 ${rg.adds[0].price}`, d: (rg.adds[0].price / g - 1) * 100 },
    { lab: `游戏止盈① ${tp1 ? fmt.p(tp1) : '—'}`, d: tp1 ? (tp1 / g - 1) * 100 : 0 },
  ].sort((a, b) => Math.abs(a.d) - Math.abs(b.d));

  let html = '';
  // ---------- 报价条 ----------
  const qc = (key, name, code, price, pct, sig, sigCls, spark) => `
    <div class="qcard ${chartSym === key ? 'on' : ''}" onclick="setChartSym('${key}')">
      <div class="qname">${name}<span class="qmeta"> ${code}</span></div>
      <div class="qrow"><span class="qprice">${key === 'sse' ? price.toFixed(2) : price.toFixed(3)}</span>
        <span class="qpct ${pct >= 0 ? 'up' : 'down'}">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span></div>
      <div class="qsig"><div class="s ${sigCls}">${sig}</div></div>
      <div class="spark" id="sp-${key}"></div>
    </div>`;
  html += `<div class="quotes">` +
    qc('dividend', D.symbols.dividend.name, D.symbols.dividend.code, h, s.liveOk ? s.live.dividend.pct : 0, cD.pos.toFixed(2) + 'σ', cD.pos <= -1 ? 'up' : (cD.pos >= 1 ? 'down' : 'flat')) +
    qc('games', D.symbols.games.name, D.symbols.games.code, g, s.liveOk ? s.live.games.pct : 0, cG.pos.toFixed(2) + 'σ', cG.pos <= -1 ? 'up' : (cG.pos >= 1 ? 'down' : 'flat')) +
    qc('sse', '上证指数', 'sh000001', ss, s.liveOk ? s.live.sse.pct : 0, ss > rg.sse_stop ? '安全' : '破位', ss < rg.sse_stop ? 'up' : 'flat') +
    `</div>`;

  // ---------- 建议横幅 ----------
  if (ss < rg.sse_stop) {
    html += `<div class="adv warn"><span class="t">⚠️ 剧本证伪线已跌破</span>
      <span class="d">上证 ${ss.toFixed(0)} &lt; ${rg.sse_stop} —— 按规则清仓全部进攻仓(游戏${L.games.sh}股),压舱仓保留。等待再入场信号。</span></div>`;
  } else if (hot.length) {
    html += `<div class="adv buy"><span class="t">⚡ ${hot.length}个作战位已到触发区</span>
      <span class="d">${hot.join(' · ')} —— 点下方动作行的[记账]入账,或挂条件单等待成交。</span></div>`;
  } else {
    html += `<div class="adv ok"><span class="t">✔ 持有等待</span>
      <span class="d">全部条件单待命中 · 最近作战位:${dists[0].lab}(${dists[0].d >= 0 ? '+' : ''}${dists[0].d.toFixed(1)}%)。挂好单不用盯盘。</span></div>`;
  }

  // ---------- 首次使用引导 ----------
  if (!s.ledger.length) {
    html += `<div class="hero"><h3>👋 欢迎使用双ETF作战系统</h3>
      <p>通道定位买卖点、历史锚点算胜率、流水账管理持仓。两种开始方式:</p>
      <div class="btns"><button onclick="loadDemoFlow()">📈 载入演示数据(30秒看懂全部)</button>
      <button class="ghost" onclick="openTradeModal({etf:'cash',act:'入金'})">✏️ 记我的第一笔(入金)</button></div></div>`;
  }

  // ---------- 图表Tab + 操作面板 ----------
  const symNames = { dividend: D.symbols.dividend.name, games: D.symbols.games.name, sse: '上证指数' };
  html += `<div class="grid2">
    <div>
      <div class="ctabs">
        ${SYMS.map(k => `<button class="${chartSym === k ? 'on' : ''}" onclick="setChartSym('${k}')">${symNames[k]}</button>`).join('')}
      </div>
      <div class="chartwrap"><div class="ct chartbox" id="ch-main"></div></div>
    </div>
    <div>
      <div class="panel" style="margin-bottom:10px"><h2>操作面板 · ${symNames[chartSym]}</h2><div id="actsbox"></div></div>
      <div class="panel" style="margin-bottom:10px"><h2>时间窗口</h2><div id="clockbox"></div></div>
    </div>
  </div>`;

  // ---------- 待办(紧凑) ----------
  const pend = [];
  if (!done.div_add1) pend.push(`红利≤<b>${fmt.p(cD.l15)}</b> 买${rd.adds[0].shares}股`);
  if (!done.div_add2) pend.push(`红利≤<b>${fmt.p(cD.l2)}</b> 买${rd.adds[1].shares}股`);
  if (!done.g_add) pend.push(`游戏≤<b>${rg.adds[0].price.toFixed(2)}</b> 买${rg.adds[0].shares}股`);
  if (!done.g_break) pend.push(`游戏周收盘&gt;<b>${rg.adds[1].price.toFixed(3)}</b> 买${rg.adds[1].shares}股`);
  pend.push(`上证收盘&lt;<b>${rg.sse_stop}</b> → 清仓进攻仓`);
  html += `<div class="todo"><b>待挂条件单</b> —— ${pend.join(' &nbsp;·&nbsp; ')}
    <div class="mini">成交后点动作行[记账],持仓/成本/止盈线自动更新</div></div>`;

  root.innerHTML = html;

  // ---------- sparklines ----------
  for (const k of SYMS) {
    const cl = D[k].daily.slice(-40).map(r => r[1]);
    drawSpark('sp-' + k, cl);
  }

  // ---------- 操作面板(当前标的) ----------
  let acts = '';
  if (chartSym === 'dividend') {
    acts = `<div class="acts">
      ${actRow({ id: 'div_add1', label: '加仓① -1.5σ', lvl: fmt.p(cD.l15), done: done.div_add1,
        hot: !done.div_add1 && h <= cD.l15, sub: '买' + rd.adds[0].shares + '股',
        rec: { price: +cD.l15.toFixed(3), shares: rd.adds[0].shares, act: '买入', etf: 'dividend', note: '加仓①' },
        dist: '距 ' + fmt.pct((cD.l15 / h - 1) * 100) })}
      ${actRow({ id: 'div_add2', label: '加仓② -2σ', lvl: fmt.p(cD.l2), done: done.div_add2,
        hot: !done.div_add2 && h <= cD.l2, sub: '买' + rd.adds[1].shares + '股',
        rec: { price: +cD.l2.toFixed(3), shares: rd.adds[1].shares, act: '买入', etf: 'dividend', note: '加仓②' },
        dist: '距 ' + fmt.pct((cD.l2 / h - 1) * 100) })}
      ${actRow({ static: true, label: '减仓 +1σ', lvl: fmt.p(cD.u1), sub: rd.trim_note,
        dist: '距 ' + fmt.pct((cD.u1 / h - 1) * 100), warn: h >= cD.u1 })}
      </div><div class="mini" style="margin-top:6px">持仓 ${L.dividend.sh}股@${L.dividend.cost.toFixed(3)} · 无止损 · 分红到账记[分红]</div>`;
  } else if (chartSym === 'games') {
    let gStatus = '持有', gCls = 'hold';
    if (ss < rg.sse_stop) { gStatus = '⛔证伪·清仓'; gCls = 'stop'; }
    else if (g <= rg.adds[0].price && !done.g_add) { gStatus = '回踩加仓触发'; gCls = 'buy'; }
    else if (g >= rg.adds[1].price && !done.g_break) { gStatus = '追涨档·等周确认'; gCls = 'buy'; }
    else if (g >= cG.u1) { gStatus = '终点区'; gCls = 'sell'; }
    else if (tp2 && g >= tp2 && !done.tp2) { gStatus = '止盈②触发'; gCls = 'sell'; }
    else if (tp1 && g >= tp1 && !done.tp1) { gStatus = '止盈①触发'; gCls = 'sell'; }
    acts = `<div class="price-row" style="margin-bottom:6px"><span class="status ${gCls}">${gStatus}</span></div>
      ${sigmaGauge(cG.pos)}<div class="acts">
      ${actRow({ id: 'g_add', label: '回踩加仓', lvl: rg.adds[0].price.toFixed(2), done: done.g_add,
        hot: !done.g_add && g <= rg.adds[0].price, sub: '买' + rg.adds[0].shares + '股·摊低成本',
        rec: { price: rg.adds[0].price, shares: rg.adds[0].shares, act: '买入', etf: 'games', note: '回踩加仓' },
        dist: '距 ' + fmt.pct((rg.adds[0].price / g - 1) * 100) })}
      ${actRow({ id: 'g_break', label: '突破追涨', lvl: rg.adds[1].price.toFixed(3), done: done.g_break,
        hot: !done.g_break && g >= rg.adds[1].price, sub: '周收盘>线 买' + rg.adds[1].shares + '股',
        rec: { price: rg.adds[1].price, shares: rg.adds[1].shares, act: '买入', etf: 'games', note: '突破追涨' },
        dist: '距 ' + fmt.pct((rg.adds[1].price / g - 1) * 100) })}
      ${actRow({ id: 'tp1', label: '止盈① ×' + rg.tp1_mult, lvl: tp1 ? fmt.p(tp1) : '—', done: done.tp1,
        hot: !done.tp1 && tp1 && g >= tp1, sub: '卖' + tranche + '股(1/3)',
        rec: tp1 ? { price: +tp1.toFixed(3), shares: tranche, act: '卖出', etf: 'games', note: '止盈①' } : null,
        dist: tp1 ? '距 ' + fmt.pct((tp1 / g - 1) * 100) : '' })}
      ${actRow({ id: 'tp2', label: '止盈② ×' + rg.tp2_mult, lvl: tp2 ? fmt.p(tp2) : '—', done: done.tp2,
        hot: !done.tp2 && tp2 && g >= tp2, sub: '卖' + tranche + '股',
        rec: tp2 ? { price: +tp2.toFixed(3), shares: tranche, act: '卖出', etf: 'games', note: '止盈②' } : null,
        dist: tp2 ? '距 ' + fmt.pct((tp2 / g - 1) * 100) : '' })}
      ${actRow({ static: true, label: '终点 +1σ', lvl: fmt.p(cG.u1), sub: '剩余仓位终点',
        dist: '距 ' + fmt.pct((cG.u1 / g - 1) * 100) })}
      ${actRow({ static: true, label: '⛔止损=上证<' + rg.sse_stop, lvl: String(rg.sse_stop), sub: '清仓全部' + L.games.sh + '股·非价格止损',
        dist: '上证距 ' + fmt.pct((rg.sse_stop / ss - 1) * 100), warn: ss < rg.sse_stop * 1.03 })}
      </div><div class="mini" style="margin-top:6px">持仓 ${L.games.sh}股@${L.games.cost.toFixed(3)} · 止盈=成本×${rg.tp1_mult}/×${rg.tp2_mult}自动重算</div>`;
  } else {
    let sStatus = '安全', sCls = 'hold';
    if (ss < rg.sse_stop) { sStatus = '⚠️已跌破'; sCls = 'stop'; }
    else if (ss < rg.sse_stop * 1.03) { sStatus = '接近证伪线'; sCls = 'sell'; }
    acts = `<div class="price-row" style="margin-bottom:6px"><span class="status ${sCls}">${sStatus}</span>
      <span class="mini">MA20 ${s.ma20.toFixed(0)}</span></div><div class="acts">
      ${actRow({ static: true, label: '剧本证伪线', lvl: String(rg.sse_stop), sub: '收盘跌破=清仓进攻仓',
        dist: '距 ' + fmt.pct((rg.sse_stop / ss - 1) * 100), warn: ss < rg.sse_stop * 1.03 })}
      ${actRow({ static: true, label: 'MA20 中轨', lvl: s.ma20.toFixed(0), sub: '中轨得失参考',
        dist: '距 ' + fmt.pct((s.ma20 / ss - 1) * 100) })}
      </div><div class="mini" style="margin-top:6px">${rg.sse_stop}=7/17低点(磨底剧本生命线)。指数在其上方时,进攻仓的回踩都是噪音——止损锚定指数,不锚定板块</div>`;
  }
  $('actsbox').innerHTML = acts;

  // ---------- 时间窗口 ----------
  const exp = new Date(rg.expiry), now = new Date();
  const days = Math.ceil((exp - now) / 864e5);
  const isFri = now.getDay() === 5;
  $('clockbox').innerHTML =
    `<div class="big"><div class="kv"><div class="k">进攻仓到期</div><div class="v">${days}<span style="font-size:12px">天</span></div></div>
    <div class="kv"><div class="k">到期日</div><div class="v" style="font-size:14px">${rg.expiry}</div></div></div>
    <div class="mini">叙事资产的兑现窗口≈12个月,<b>到期评估不恋战</b>;压舱仓无限期每年复检</div>
    <div class="act${isFri ? ' warn' : ''}" style="margin-top:6px"><span class="tag">周五</span>
    <span>周收盘&gt;${rg.adds[1].price.toFixed(3)}? → 追涨档成立</span><span class="dist">${isFri ? '今天!' : '到周五看'}</span></div>`;

  // ---------- 主图表 ----------
  const chartCfg = {
    dividend: () => ({
      ohlc: D.dividend.ohlc, daily: D.dividend.daily, live: h, chan: chD.rows, cost: L.dividend.cost || null,
      levels: [
        { p: cD.l15, label: '加仓① ' + fmt.p(cD.l15), color: '#26a69a' },
        { p: cD.l2, label: '加仓② ' + fmt.p(cD.l2), color: '#1c7a6d', dash: '4 3' },
        { p: cD.u1, label: '减仓 ' + fmt.p(cD.u1), color: '#ef5350' }],
    }),
    games: () => ({
      ohlc: D.games.ohlc, daily: D.games.daily, live: g, chan: chG.rows, cost: L.games.cost || null,
      levels: [
        { p: rg.adds[0].price, label: '回踩 ' + rg.adds[0].price.toFixed(2), color: '#26a69a' },
        { p: rg.adds[1].price, label: '追涨 ' + rg.adds[1].price.toFixed(3), color: '#1c7a6d', dash: '5 3' },
        { p: tp1, label: '止盈① ' + (tp1 ? fmt.p(tp1) : ''), color: '#ef5350' },
        { p: tp2, label: '止盈② ' + (tp2 ? fmt.p(tp2) : ''), color: '#c53040' },
        { p: cG.u1, label: '+1σ ' + fmt.p(cG.u1), color: '#f2828a', dash: '2 3' }],
    }),
    sse: () => ({
      ohlc: D.sse.ohlc, daily: D.sse.daily, live: ss, ma20: true,
      levels: [{ p: rg.sse_stop, label: '证伪线 ' + rg.sse_stop, color: '#ef5350', w: 1.8 }],
      yfmt: v => v.toFixed(0),
    }),
  };
  const el = document.getElementById('ch-main');
  if (el) {
    const cfg = chartCfg[chartSym]();
    drawChart('ch-main', Object.assign({ height: 470 }, cfg));
  }
}

window.loadDemoFlow = async () => {
  try {
    await api.seedDemo();
    await ledger.load();
    store.set({ ledger: ledger.rows });
    toast('演示数据已载入 · 看看[持仓]和[量化分析]页');
  } catch (e) { toast('载入失败: ' + e.message, 'err'); }
};
