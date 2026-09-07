// 概览视图:引导 + 待办 + 决策卡 + 图表 + 时间窗口
import { store } from '../store.js';
import { drawChart } from '../charts.js';
import { actRow, sigmaGauge, toast } from '../ui.js';
import { ledger } from '../ledger.js';
import { api } from '../api.js';
import { fmt } from '../config.js';

const $ = id => document.getElementById(id);

export function renderDashboard(root) {
  const s = store.state;
  const D = s.D;
  const rg = D.rules.games, rd = D.rules.dividend;
  const lastD = k => D[k].daily[D[k].daily.length - 1][1];
  const g = s.liveOk ? s.live.games.price : lastD('games');
  const h = s.liveOk ? s.live.dividend.price : lastD('dividend');
  const ss = s.liveOk ? s.live.sse.price : lastD('sse');
  const L = s.L;
  // 通道(实时价重算)
  const chD = s.chD, chG = s.chG;
  const cD = chD.last, cG = chG.last;
  const tp1 = (L.games.cost || 0) * rg.tp1_mult, tp2 = (L.games.cost || 0) * rg.tp2_mult;
  const done = s.done;

  let html = '';
  // 止损警报
  if (ss < rg.sse_stop) {
    html += `<div class="warnbar" style="display:block">⚠️ <b>剧本证伪线已跌破(上证 ${ss.toFixed(0)} &lt; ${rg.sse_stop})</b> —— 按规则清仓全部进攻仓,压舱仓保留。等待再入场信号。</div>`;
  }
  // 首次使用引导
  if (!s.ledger.length) {
    html += `<div class="hero">
      <h3>👋 欢迎使用双ETF作战系统</h3>
      <p>这是一个本地运行的量化决策工具:通道定位买卖点、历史锚点算胜率、流水账管理持仓。<b>两种开始方式:</b></p>
      <div class="btns">
        <button onclick="loadDemoFlow()">📈 载入演示数据(30秒看懂全部功能,随时清空)</button>
        <button class="ghost" onclick="openTradeModal({etf:'cash',act:'入金'})">✏️ 开始记录我的第一笔(通常是入金)</button>
      </div></div>`;
  }
  // 待办
  const pend = [];
  if (!done.div_add1) pend.push(`红利≤<b>${fmt.p(cD.l15)}</b>(-1.5σ) 买${rd.adds[0].shares}股`);
  if (!done.div_add2) pend.push(`红利≤<b>${fmt.p(cD.l2)}</b>(-2σ) 买${rd.adds[1].shares}股`);
  if (!done.g_add) pend.push(`游戏≤<b>${rg.adds[0].price.toFixed(2)}</b> 买${rg.adds[0].shares}股(回踩档)`);
  if (!done.g_break) pend.push(`游戏周收盘&gt;<b>${rg.adds[1].price.toFixed(3)}</b> 买${rg.adds[1].shares}股(追涨档)`);
  pend.push(`上证收盘<b>&lt;${rg.sse_stop}</b> → 警报·清仓进攻仓`);
  html += `<div class="todo"><b>待挂/待执行条件单</b> —— ${pend.join(' &nbsp;·&nbsp; ')}
    <div class="mini">全部限价/条件单挂好后不用盯盘;成交后点动作行的[记账]入账,持仓与成本自动更新</div></div>`;

  // ---------- 红利卡 ----------
  let dStatus = '持有', dCls = 'hold';
  if (h >= cD.u1) { dStatus = '减仓区(+1σ)'; dCls = 'sell'; }
  else if (h <= cD.l2 && !done.div_add2) { dStatus = '加仓②触发'; dCls = 'buy'; }
  else if (h <= cD.l15 && !done.div_add1) { dStatus = '加仓①触发'; dCls = 'buy'; }
  html += `<div class="cards">` +
    `<div class="card"><div class="head"><span class="name">${D.symbols.dividend.name} · 压舱仓</span><span class="role">${rd.role}</span></div>
    <div class="price-row"><span class="price">${h.toFixed(3)}</span>
    <span class="pct ${s.liveOk && s.live.dividend.pct >= 0 ? 'up' : 'down'}">${s.liveOk ? fmt.pct(s.live.dividend.pct) : ''}</span>
    <span class="status ${dCls}">${dStatus}</span></div>
    ${sigmaGauge(cD.pos)}<div class="acts">
    ${actRow({ id: 'div_add1', label: rd.adds[0].label + ' -1.5σ', lvl: fmt.p(cD.l15), done: done.div_add1,
      hot: !done.div_add1 && h <= cD.l15, sub: '买' + rd.adds[0].shares + '股',
      rec: { price: +cD.l15.toFixed(3), shares: rd.adds[0].shares, act: '买入', etf: 'dividend', note: '加仓①' },
      dist: '距 ' + fmt.pct((cD.l15 / h - 1) * 100) })}
    ${actRow({ id: 'div_add2', label: rd.adds[1].label + ' -2σ', lvl: fmt.p(cD.l2), done: done.div_add2,
      hot: !done.div_add2 && h <= cD.l2, sub: '买' + rd.adds[1].shares + '股',
      rec: { price: +cD.l2.toFixed(3), shares: rd.adds[1].shares, act: '买入', etf: 'dividend', note: '加仓②' },
      dist: '距 ' + fmt.pct((cD.l2 / h - 1) * 100) })}
    ${actRow({ static: true, label: '减仓 +1σ', lvl: fmt.p(cD.u1), sub: rd.trim_note,
      dist: '距 ' + fmt.pct((cD.u1 / h - 1) * 100), warn: h >= cD.u1 })}
    </div><div class="mini" style="margin-top:6px">持仓 ${L.dividend.sh}股@${L.dividend.cost.toFixed(3)} · ${rd.hold} · <b>无止损</b> · 分红到账用[记账·分红]录入</div></div>`;
  // ---------- 游戏卡 ----------
  const gsh = L.games.sh, tranche = gsh > 0 ? fmt.lot(gsh / 3) : 0;
  let gStatus = '持有', gCls = 'hold';
  if (ss < rg.sse_stop) { gStatus = '⛔剧本证伪·清仓'; gCls = 'stop'; }
  else if (g <= rg.adds[0].price && !done.g_add) { gStatus = '回踩加仓触发'; gCls = 'buy'; }
  else if (g >= rg.adds[1].price && !done.g_break) { gStatus = '追涨档·等周收盘确认'; gCls = 'buy'; }
  else if (g >= cG.u1) { gStatus = '终点区(+1σ)'; gCls = 'sell'; }
  else if (tp2 && g >= tp2 && !done.tp2) { gStatus = '止盈②触发'; gCls = 'sell'; }
  else if (tp1 && g >= tp1 && !done.tp1) { gStatus = '止盈①触发'; gCls = 'sell'; }
  html += `<div class="card"><div class="head"><span class="name">${D.symbols.games.name} · 进攻仓</span><span class="role">${rg.role}</span></div>
    <div class="price-row"><span class="price">${g.toFixed(3)}</span>
    <span class="pct ${s.liveOk && s.live.games.pct >= 0 ? 'up' : 'down'}">${s.liveOk ? fmt.pct(s.live.games.pct) : ''}</span>
    <span class="status ${gCls}">${gStatus}</span></div>
    ${sigmaGauge(cG.pos)}<div class="acts">
    ${actRow({ id: 'g_add', label: '回踩 ' + rg.adds[0].price.toFixed(2), lvl: rg.adds[0].price.toFixed(2), done: done.g_add,
      hot: !done.g_add && g <= rg.adds[0].price, sub: '买' + rg.adds[0].shares + '股·摊低成本',
      rec: { price: rg.adds[0].price, shares: rg.adds[0].shares, act: '买入', etf: 'games', note: '回踩加仓' },
      dist: '距 ' + fmt.pct((rg.adds[0].price / g - 1) * 100) })}
    ${actRow({ id: 'g_break', label: '突破追涨 ' + rg.adds[1].price.toFixed(3), lvl: rg.adds[1].price.toFixed(3), done: done.g_break,
      hot: !done.g_break && g >= rg.adds[1].price, sub: '周收盘>此线 买' + rg.adds[1].shares + '股·数据支持追涨',
      rec: { price: rg.adds[1].price, shares: rg.adds[1].shares, act: '买入', etf: 'games', note: '突破追涨' },
      dist: '距 ' + fmt.pct((rg.adds[1].price / g - 1) * 100) })}
    ${actRow({ id: 'tp1', label: '止盈① ×' + rg.tp1_mult, lvl: tp1 ? fmt.p(tp1) : '—', done: done.tp1,
      hot: !done.tp1 && tp1 && g >= tp1, sub: '卖' + tranche + '股(持仓1/3)',
      rec: tp1 ? { price: +tp1.toFixed(3), shares: tranche, act: '卖出', etf: 'games', note: '止盈①' } : null,
      dist: tp1 ? '距 ' + fmt.pct((tp1 / g - 1) * 100) : '' })}
    ${actRow({ id: 'tp2', label: '止盈② ×' + rg.tp2_mult, lvl: tp2 ? fmt.p(tp2) : '—', done: done.tp2,
      hot: !done.tp2 && tp2 && g >= tp2, sub: '卖' + tranche + '股',
      rec: tp2 ? { price: +tp2.toFixed(3), shares: tranche, act: '卖出', etf: 'games', note: '止盈②' } : null,
      dist: tp2 ? '距 ' + fmt.pct((tp2 / g - 1) * 100) : '' })}
    ${actRow({ static: true, label: '终点 +1σ', lvl: fmt.p(cG.u1), sub: '剩余仓位终点',
      dist: '距 ' + fmt.pct((cG.u1 / g - 1) * 100) })}
    ${actRow({ static: true, label: '⛔止损=上证<' + rg.sse_stop, lvl: String(rg.sse_stop), sub: '清仓全部' + gsh + '股·非价格止损',
      rec: gsh ? { price: rg.sse_stop, shares: gsh, act: '卖出', etf: 'games', note: '剧本证伪清仓' } : null,
      dist: '上证距 ' + fmt.pct((rg.sse_stop / ss - 1) * 100), warn: ss < rg.sse_stop * 1.03 })}
    </div><div class="mini" style="margin-top:6px">持仓 ${gsh}股@${L.games.cost.toFixed(3)} · 止盈线=加权成本×${rg.tp1_mult}/×${rg.tp2_mult},记账后自动重算 · 前低${rg.old_stop}仅参考</div></div>`;
  // ---------- 大盘卡 ----------
  let sStatus = '安全', sCls = 'hold';
  if (ss < rg.sse_stop) { sStatus = '⚠️已跌破'; sCls = 'stop'; }
  else if (ss < rg.sse_stop * 1.03) { sStatus = '接近证伪线'; sCls = 'sell'; }
  html += `<div class="card"><div class="head"><span class="name">上证指数 · 剧本开关</span><span class="role">决定进攻仓去留</span></div>
    <div class="price-row"><span class="price">${ss.toFixed(2)}</span>
    <span class="pct ${s.liveOk && s.live.sse.pct >= 0 ? 'up' : 'down'}">${s.liveOk ? fmt.pct(s.live.sse.pct) : ''}</span>
    <span class="status ${sCls}">${sStatus}</span></div>
    <div class="acts">
    ${actRow({ static: true, label: '剧本证伪线', lvl: String(rg.sse_stop), sub: '收盘跌破=清仓进攻仓',
      dist: '距 ' + fmt.pct((rg.sse_stop / ss - 1) * 100), warn: ss < rg.sse_stop * 1.03 })}
    ${actRow({ static: true, label: 'MA20 中轨', lvl: s.ma20.toFixed(0), sub: '中轨得失参考',
      dist: '距 ' + fmt.pct((s.ma20 / ss - 1) * 100) })}
    </div><div class="mini" style="margin-top:6px">${rg.sse_stop}=7/17低点(磨底剧本生命线)。指数在其上方时,进攻仓的一切回踩都是噪音——止损锚定指数,不锚定板块</div></div></div>`;

  // ---------- 图表 ----------
  html += `<div class="panel"><h2>${D.symbols.dividend.name} · 通道与作战位 <span class="mini">(月线36月滚动±1σ·后复权口径·加仓线随通道自动调整)</span></h2><div class="chartbox" id="ch-div"></div></div>
  <div class="panel"><h2>${D.symbols.games.name} · 通道与作战位 <span class="mini">(止盈=加权成本×${rg.tp1_mult}/×${rg.tp2_mult} · 档位=持仓1/3 · 止损只看上证${rg.sse_stop})</span></h2><div class="chartbox" id="ch-gam"></div></div>
  <div class="grid2"><div class="panel" style="margin:0"><h2>上证指数 · 剧本开关</h2><div class="chartbox" id="ch-sse"></div></div>
  <div class="panel" style="margin:0"><h2>时间窗口</h2><div id="clockbox"></div></div></div>`;
  root.innerHTML = html;

  // 时间窗口
  const exp = new Date(rg.expiry), now = new Date();
  const days = Math.ceil((exp - now) / 864e5);
  const isFri = now.getDay() === 5;
  $('clockbox').innerHTML =
    `<div class="big"><div class="kv"><div class="k">进攻仓到期</div><div class="v">${days}<span style="font-size:13px">天</span></div></div>
    <div class="kv"><div class="k">到期日</div><div class="v" style="font-size:15px">${rg.expiry}</div></div></div>
    <div class="mini" style="margin-bottom:8px">叙事资产的兑现窗口=修复期(约12个月)。<b>到期评估,不恋战</b>;压舱仓无限期,每年复检</div>
    <div class="act${isFri ? ' warn' : ''}" style="margin-bottom:5px"><span class="tag">本周五检查</span>
    <span>周收盘 &gt; ${rg.adds[1].price.toFixed(3)}? → 追涨档成立</span><span class="dist">${isFri ? '今天就是周五!' : '到周五看一眼'}</span></div>
    <div class="act" style="margin-bottom:5px"><span class="tag">每月中</span><span>经济数据 / 利率 / 政策会议</span></div>
    <div class="act"><span class="tag">检查频率</span><span>平时不看盘,动作由条件单执行</span></div>`;

  // 图表
  drawChart('ch-div', {
    daily: D.dividend.daily, live: h, chan: chD.rows, cost: L.dividend.cost || null,
    levels: [
      { p: cD.l15, label: '加仓① ' + fmt.p(cD.l15), color: '#10b981' },
      { p: cD.l2, label: '加仓② ' + fmt.p(cD.l2), color: '#059669', dash: '4 3' },
      { p: cD.u1, label: '减仓 ' + fmt.p(cD.u1), color: '#f87171' }],
  });
  drawChart('ch-gam', {
    daily: D.games.daily, live: g, chan: chG.rows, cost: L.games.cost || null,
    levels: [
      { p: rg.adds[0].price, label: '回踩加仓 ' + rg.adds[0].price.toFixed(2), color: '#10b981' },
      { p: rg.adds[1].price, label: '突破追涨 ' + rg.adds[1].price.toFixed(3), color: '#34d399', dash: '5 3' },
      { p: tp1, label: '止盈① ' + (tp1 ? fmt.p(tp1) : ''), color: '#f87171' },
      { p: tp2, label: '止盈② ' + (tp2 ? fmt.p(tp2) : ''), color: '#ef4444' },
      { p: cG.u1, label: '+1σ ' + fmt.p(cG.u1), color: '#fb7185', dash: '2 3' },
      { p: rg.old_stop, label: '前低 ' + rg.old_stop + '(参考)', color: '#64748b', dash: '1 3' }],
  });
  drawChart('ch-sse', {
    daily: D.sse.daily, live: ss, ma20: true,
    levels: [{ p: rg.sse_stop, label: '证伪线 ' + rg.sse_stop, color: '#f87171' }],
    yfmt: v => v.toFixed(0),
  });
}

window.loadDemoFlow = async () => {
  try {
    await api.seedDemo();
    await ledger.load();
    store.set({ ledger: ledger.rows });
    toast('演示数据已载入 · 看看[持仓]和[量化分析]页');
  } catch (e) { toast('载入失败: ' + e.message, 'err'); }
};
