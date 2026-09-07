// 主入口:数据获取 → 快照 → 渲染管线
import { api } from './api.js';
import { chan, curChannel } from './channel.js';
import { drawChart } from './charts.js';
import { ledger, calc, exportJSON } from './ledger.js';
import { POLL_MS, LS_DONE, LS_P, ZONE_CUTS, fmt, todayStr } from './config.js';

const $ = id => document.getElementById(id);

let D = null;            // /api/data
let live = null, liveOk = false;
let SP = null;            // 渲染快照
let P_REPAIR = +(localStorage.getItem(LS_P) || 58);
let done = JSON.parse(localStorage.getItem(LS_DONE) || '{}');
const saveDone = () => localStorage.setItem(LS_DONE, JSON.stringify(done));

// ------------------------------------------------------------------
// 快照:实时价+通道+流水 → 页面渲染所需的一切
// ------------------------------------------------------------------
function snapshot() {
  const lastD = k => D[k].daily[D[k].daily.length - 1][1];
  const g = liveOk ? live.games.price : lastD('games');
  const h = liveOk ? live.dividend.price : lastD('dividend');
  const s = liveOk ? live.sse.price : lastD('sse');
  const L = calc(ledger.rows);
  const chD = curChannel('dividend', h, D.dividend.monthlies, D.ratio);
  const chG = curChannel('games', g, D.games.monthlies, 1);
  const gc = L.games.cost || 0;
  const rg = D.rules.games;
  return {
    g, h, s, L, chD, chG,
    tp1: gc * rg.tp1_mult, tp2: gc * rg.tp2_mult,
    ma20: (() => {
      const d = D.sse.daily.map(r => r[1]); d.push(s);
      return d.length < 20 ? s : d.slice(-20).reduce((a, b) => a + b, 0) / 20;
    })(),
  };
}

// ------------------------------------------------------------------
// 渲染管线
// ------------------------------------------------------------------
function render() {
  renderHeader(); renderTodo(); renderCards(); renderCharts();
  renderClock(); renderLedger(); renderPF(); renderWR(); renderChase(); renderFooter();
}

function renderHeader() {
  const t = liveOk && live.games ? live.games.time : null;
  let st = '离线(数据快照)', cls = 'badge off';
  if (t) {
    const hh = +t.slice(8, 10), mm = +t.slice(10, 12);
    const wd = new Date(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8)).getDay();
    const trad = wd >= 1 && wd <= 5 && ((hh === 9 && mm >= 30) || (hh === 10) || (hh === 11 && mm <= 30) || (hh === 13) || (hh === 14));
    st = trad ? '交易中' : '已收盘'; cls = trad ? 'badge live' : 'badge';
  }
  $('mkt').textContent = st; $('mkt').className = cls;
  $('upt').textContent = (liveOk ? '实时行情' : '离线快照') + ' · 历史与回测 ' + D.updated;
  const stop = SP.s < D.rules.games.sse_stop;
  const wb = $('stopbanner');
  if (stop) {
    wb.style.display = 'block';
    wb.innerHTML = '⚠️ <b>剧本证伪线已跌破(上证 ' + SP.s.toFixed(0) + ' &lt; ' + D.rules.games.sse_stop + ')</b> —— 按规则清仓全部游戏,红利保留。等待再入场信号。';
  } else wb.style.display = 'none';
}

function renderTodo() {
  const cD = SP.chD.last, rg = D.rules.games, pend = [];
  const dA = D.rules.dividend.adds;
  if (!done.div_add1) pend.push('红利≤<b>' + fmt.p(cD.l15) + '</b>(-1.5σ) 买' + dA[0].shares + '股');
  if (!done.div_add2) pend.push('红利≤<b>' + fmt.p(cD.l2) + '</b>(-2σ) 买' + dA[1].shares + '股');
  if (!done.g_add) pend.push('游戏≤<b>' + rg.adds[0].price.toFixed(2) + '</b> 买' + rg.adds[0].shares + '股(回踩档)');
  if (!done.g_break) pend.push('游戏周收盘&gt;<b>' + rg.adds[1].price.toFixed(3) + '</b> 买' + rg.adds[1].shares + '股(追涨档)');
  pend.push('上证收盘<b>&lt;' + rg.sse_stop + '</b> → 警报·清仓游戏');
  $('todo').innerHTML = '<b>待挂/待执行条件单</b> —— ' + pend.join(' &nbsp;·&nbsp; ')
    + '<div class="mini">全部限价/条件单挂好后不用盯盘;成交后点动作行的[记账]入账,页面自动更新持仓与成本</div>';
}

function sigmaGauge(pos) {
  const lo = -2.5, hi = 1.5, x = Math.max(lo, Math.min(hi, pos));
  return '<div class="gauge"><div class="mark" style="left:' + ((x - lo) / (hi - lo) * 100) + '%"></div></div>'
    + '<div class="gauge-labels"><span>-2.5σ</span><span>-1σ</span><span>中轨</span><span>+1σ</span><span class="flat"><b>' + pos.toFixed(2) + 'σ</b> 现在</span></div>';
}
function actRow(o) {
  const chk = o.static ? '' :
    '<input type="checkbox" ' + (o.done ? 'checked' : '') + ' onchange="toggleDone(\'' + o.id + '\')">';
  const rec = o.rec ? '<button class="sm ghost" onclick="recordAction(\'' + o.id + '\',' + o.rec.price + ',' + o.rec.shares + ',\'' + o.rec.act + '\',\'' + o.rec.etf + '\')">记账</button>' : '';
  return '<div class="act ' + (o.done ? 'done ' : '') + (o.hot ? 'hot ' : '') + (o.warn ? 'warn' : '') + '">'
    + chk + '<span class="tag">' + o.label + '</span>'
    + '<span class="lvl">' + o.lvl + '</span><span class="mini">' + (o.sub || '') + '</span>'
    + rec + '<span class="dist">' + (o.dist || '') + '</span></div>';
}
window.toggleDone = id => { done[id] = !done[id]; saveDone(); render(); };
window.recordAction = async (id, price, shares, act, etf) => {
  await ledger.add({ date: todayStr(), etf, act, price, shares, fee: 0, note: '规则动作:' + id });
  done[id] = true; saveDone();
  refreshSnapshot();
  const el = $('ledger-table');
  if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
};

function renderCards() {
  const cD = SP.chD.last, cG = SP.chG.last, rg = D.rules.games, rd = D.rules.dividend;
  const hh = SP.h, gg = SP.g, ss = SP.s, L = SP.L;
  // 红利
  let dStatus = '持有', dCls = 'hold';
  if (hh >= cD.u1) { dStatus = '减仓区(+1σ)'; dCls = 'sell'; }
  else if (hh <= cD.l2 && !done.div_add2) { dStatus = '加仓②触发'; dCls = 'buy'; }
  else if (hh <= cD.l15 && !done.div_add1) { dStatus = '加仓①触发'; dCls = 'buy'; }
  const divCard =
    '<div class="card"><div class="head"><span class="name">' + rd.name + '</span><span class="role">' + rd.role + '</span></div>'
    + '<div class="price-row"><span class="price">' + hh.toFixed(3) + '</span>'
    + '<span class="pct ' + (liveOk && live.dividend.pct >= 0 ? 'up' : 'down') + '">' + (liveOk ? fmt.pct(live.dividend.pct) : '') + '</span>'
    + '<span class="status ' + dCls + '">' + dStatus + '</span></div>'
    + sigmaGauge(cD.pos)
    + '<div class="acts">'
    + actRow({ id: 'div_add1', label: rd.adds[0].label + ' -1.5σ', lvl: fmt.p(cD.l15), done: done.div_add1,
        hot: !done.div_add1 && hh <= cD.l15, sub: '买' + rd.adds[0].shares + '股',
        rec: { price: +cD.l15.toFixed(3), shares: rd.adds[0].shares, act: '买入', etf: 'dividend' },
        dist: '距 ' + fmt.pct((cD.l15 / hh - 1) * 100) })
    + actRow({ id: 'div_add2', label: rd.adds[1].label + ' -2σ', lvl: fmt.p(cD.l2), done: done.div_add2,
        hot: !done.div_add2 && hh <= cD.l2, sub: '买' + rd.adds[1].shares + '股',
        rec: { price: +cD.l2.toFixed(3), shares: rd.adds[1].shares, act: '买入', etf: 'dividend' },
        dist: '距 ' + fmt.pct((cD.l2 / hh - 1) * 100) })
    + actRow({ static: true, label: '减仓 +1σ', lvl: fmt.p(cD.u1), sub: rd.trim_note,
        dist: '距 ' + fmt.pct((cD.u1 / hh - 1) * 100), warn: hh >= cD.u1 })
    + '</div><div class="mini" style="margin-top:6px">持仓 ' + L.dividend.sh + '股@' + L.dividend.cost.toFixed(3)
    + ' · ' + rd.hold + ' · <b>无止损</b> · 分红到账用[记账·分红]录入</div></div>';
  // 游戏
  const gsh = L.games.sh, tranche = gsh > 0 ? fmt.lot(gsh / 3) : 0;
  let gStatus = '持有', gCls = 'hold';
  if (ss < rg.sse_stop) { gStatus = '⛔剧本证伪·清仓'; gCls = 'stop'; }
  else if (gg <= rg.adds[0].price && !done.g_add) { gStatus = '回踩加仓触发'; gCls = 'buy'; }
  else if (gg >= rg.adds[1].price && !done.g_break) { gStatus = '追涨档·等周收盘确认'; gCls = 'buy'; }
  else if (gg >= cG.u1) { gStatus = '终点区(+1σ)'; gCls = 'sell'; }
  else if (SP.tp2 && gg >= SP.tp2 && !done.tp2) { gStatus = '止盈②触发'; gCls = 'sell'; }
  else if (SP.tp1 && gg >= SP.tp1 && !done.tp1) { gStatus = '止盈①触发'; gCls = 'sell'; }
  const gamCard =
    '<div class="card"><div class="head"><span class="name">' + rg.name + '</span><span class="role">' + rg.role + '</span></div>'
    + '<div class="price-row"><span class="price">' + gg.toFixed(3) + '</span>'
    + '<span class="pct ' + (liveOk && live.games.pct >= 0 ? 'up' : 'down') + '">' + (liveOk ? fmt.pct(live.games.pct) : '') + '</span>'
    + '<span class="status ' + gCls + '">' + gStatus + '</span></div>'
    + sigmaGauge(cG.pos)
    + '<div class="acts">'
    + actRow({ id: 'g_add', label: '回踩 ' + rg.adds[0].price.toFixed(2), lvl: rg.adds[0].price.toFixed(2), done: done.g_add,
        hot: !done.g_add && gg <= rg.adds[0].price, sub: '买' + rg.adds[0].shares + '股·摊低成本',
        rec: { price: rg.adds[0].price, shares: rg.adds[0].shares, act: '买入', etf: 'games' },
        dist: '距 ' + fmt.pct((rg.adds[0].price / gg - 1) * 100) })
    + actRow({ id: 'g_break', label: '突破追涨 ' + rg.adds[1].price.toFixed(3), lvl: rg.adds[1].price.toFixed(3), done: done.g_break,
        hot: !done.g_break && gg >= rg.adds[1].price, sub: '周收盘>此线 买' + rg.adds[1].shares + '股·数据支持追涨',
        rec: { price: rg.adds[1].price, shares: rg.adds[1].shares, act: '买入', etf: 'games' },
        dist: '距 ' + fmt.pct((rg.adds[1].price / gg - 1) * 100) })
    + actRow({ id: 'tp1', label: '止盈① ×' + rg.tp1_mult, lvl: SP.tp1 ? fmt.p(SP.tp1) : '—', done: done.tp1,
        hot: !done.tp1 && SP.tp1 && gg >= SP.tp1, sub: '卖' + tranche + '股(持仓1/3)',
        rec: SP.tp1 ? { price: +SP.tp1.toFixed(3), shares: tranche, act: '卖出', etf: 'games' } : null,
        dist: SP.tp1 ? '距 ' + fmt.pct((SP.tp1 / gg - 1) * 100) : '' })
    + actRow({ id: 'tp2', label: '止盈② ×' + rg.tp2_mult, lvl: SP.tp2 ? fmt.p(SP.tp2) : '—', done: done.tp2,
        hot: !done.tp2 && SP.tp2 && gg >= SP.tp2, sub: '卖' + tranche + '股',
        rec: SP.tp2 ? { price: +SP.tp2.toFixed(3), shares: tranche, act: '卖出', etf: 'games' } : null,
        dist: SP.tp2 ? '距 ' + fmt.pct((SP.tp2 / gg - 1) * 100) : '' })
    + actRow({ static: true, label: '终点 +1σ', lvl: fmt.p(cG.u1), sub: '剩余仓位终点',
        dist: '距 ' + fmt.pct((cG.u1 / gg - 1) * 100) })
    + actRow({ static: true, label: '⛔止损=上证<' + rg.sse_stop, lvl: String(rg.sse_stop), sub: '清仓全部' + gsh + '股·非价格止损',
        rec: gsh ? { price: rg.sse_stop, shares: gsh, act: '卖出', etf: 'games' } : null,
        dist: '上证距 ' + fmt.pct((rg.sse_stop / ss - 1) * 100), warn: ss < rg.sse_stop * 1.03 })
    + '</div><div class="mini" style="margin-top:6px">持仓 ' + gsh + '股@' + L.games.cost.toFixed(3)
    + ' · 止盈线=加权成本×' + rg.tp1_mult + '/×' + rg.tp2_mult + ',记账后自动重算 · 前低' + rg.old_stop + '仅参考</div></div>';
  // 大盘
  let sStatus = '安全', sCls = 'hold';
  if (ss < rg.sse_stop) { sStatus = '⚠️已跌破'; sCls = 'stop'; }
  else if (ss < rg.sse_stop * 1.03) { sStatus = '接近证伪线'; sCls = 'sell'; }
  const sseCard =
    '<div class="card"><div class="head"><span class="name">上证指数 · 剧本开关</span><span class="role">决定进攻仓去留</span></div>'
    + '<div class="price-row"><span class="price">' + ss.toFixed(2) + '</span>'
    + '<span class="pct ' + (liveOk && live.sse.pct >= 0 ? 'up' : 'down') + '">' + (liveOk ? fmt.pct(live.sse.pct) : '') + '</span>'
    + '<span class="status ' + sCls + '">' + sStatus + '</span></div>'
    + '<div class="acts">'
    + actRow({ static: true, label: '剧本证伪线', lvl: String(rg.sse_stop), sub: '收盘跌破=清仓进攻仓',
        dist: '距 ' + fmt.pct((rg.sse_stop / ss - 1) * 100), warn: ss < rg.sse_stop * 1.03 })
    + actRow({ static: true, label: 'MA20 中轨', lvl: SP.ma20.toFixed(0), sub: '中轨得失参考',
        dist: '距 ' + fmt.pct((SP.ma20 / ss - 1) * 100) })
    + '</div><div class="mini" style="margin-top:6px">' + rg.sse_stop + '=7/17低点(磨底剧本生命线)。指数在其上方时,进攻仓的一切回踩都是噪音——止损锚定指数,不锚定板块</div></div>';
  $('cards').innerHTML = divCard + gamCard + sseCard;
  $('h-div').innerHTML = D.symbols.dividend.name + ' · 通道与作战位 <span class="mini">(月线36月滚动±1σ·后复权口径·加仓线随通道自动调整)</span>';
  $('h-gam').innerHTML = D.symbols.games.name + ' · 通道与作战位 <span class="mini">(止盈=加权成本×' + rg.tp1_mult + '/×' + rg.tp2_mult + ' · 档位=持仓1/3 · 止损只看上证' + rg.sse_stop + ')</span>';
}

function renderCharts() {
  drawChart('ch-div', {
    daily: D.dividend.daily, live: SP.h, chan: SP.chD.rows, cost: SP.L.dividend.cost || null,
    levels: [
      { p: SP.chD.last.l15, label: '加仓① ' + fmt.p(SP.chD.last.l15), color: '#10b981' },
      { p: SP.chD.last.l2, label: '加仓② ' + fmt.p(SP.chD.last.l2), color: '#059669', dash: '4 3' },
      { p: SP.chD.last.u1, label: '减仓 ' + fmt.p(SP.chD.last.u1), color: '#f87171' }],
  });
  drawChart('ch-gam', {
    daily: D.games.daily, live: SP.g, chan: SP.chG.rows, cost: SP.L.games.cost || null,
    levels: [
      { p: D.rules.games.adds[0].price, label: '回踩加仓 ' + D.rules.games.adds[0].price.toFixed(2), color: '#10b981' },
      { p: D.rules.games.adds[1].price, label: '突破追涨 ' + D.rules.games.adds[1].price.toFixed(3), color: '#34d399', dash: '5 3' },
      { p: SP.tp1, label: '止盈① ' + (SP.tp1 ? fmt.p(SP.tp1) : ''), color: '#f87171' },
      { p: SP.tp2, label: '止盈② ' + (SP.tp2 ? fmt.p(SP.tp2) : ''), color: '#ef4444' },
      { p: SP.chG.last.u1, label: '+1σ ' + fmt.p(SP.chG.last.u1), color: '#fb7185', dash: '2 3' },
      { p: D.rules.games.old_stop, label: '前低 ' + D.rules.games.old_stop + '(参考)', color: '#64748b', dash: '1 3' }],
  });
  drawChart('ch-sse', {
    daily: D.sse.daily, live: SP.s, ma20: true,
    levels: [{ p: D.rules.games.sse_stop, label: '证伪线 ' + D.rules.games.sse_stop, color: '#f87171' }],
    yfmt: v => v.toFixed(0),
  });
}

function renderClock() {
  const rg = D.rules.games;
  const exp = new Date(rg.expiry), now = new Date();
  const days = Math.ceil((exp - now) / 864e5);
  const isFri = now.getDay() === 5;
  $('clockbox').innerHTML =
    '<div class="big"><div class="kv"><div class="k">进攻仓到期</div><div class="v">' + days + '<span style="font-size:13px">天</span></div></div>'
    + '<div class="kv"><div class="k">到期日</div><div class="v" style="font-size:15px">' + rg.expiry + '</div></div></div>'
    + '<div class="mini" style="margin-bottom:8px">叙事资产的兑现窗口=修复期(约12个月)。持24月胜率低于12月——<b>到期评估,不恋战</b>;压舱仓无限期,每年复检</div>'
    + '<div class="act' + (isFri ? ' warn' : '') + '" style="margin-bottom:5px"><span class="tag">本周五检查</span>'
    + '<span>周收盘 &gt; ' + rg.adds[1].price.toFixed(3) + '? → 追涨档成立</span><span class="dist">' + (isFri ? '今天就是周五!' : '到周五看一眼') + '</span></div>'
    + '<div class="act" style="margin-bottom:5px"><span class="tag">每月中</span><span>经济数据 / 利率 / 政策会议</span></div>'
    + '<div class="act"><span class="tag">检查频率</span><span>平时不看盘,动作由条件单执行</span></div>';
}

// ------------------------------------------------------------------
// 流水账 + 持仓
// ------------------------------------------------------------------
window.addLedger = async () => {
  const r = {
    date: $('lf-date').value || todayStr(),
    etf: $('lf-etf').value, act: $('lf-act').value,
    price: parseFloat($('lf-price').value) || 0,
    shares: Math.round(parseFloat($('lf-shares').value) || 0),
    fee: parseFloat($('lf-fee').value) || 0, note: '',
  };
  if (!(r.shares > 0)) { alert('请填股数/金额'); return; }
  if (r.act === '入金') { r.etf = 'cash'; r.price = 0; }
  await ledger.add(r);
  refreshSnapshot();
  const el = $('ledger-table');
  if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
};
window.delLedger = async id => { await ledger.remove(id); refreshSnapshot(); };
window.loadDemo = async () => {
  if (!confirm('载入演示流水?当前流水将被替换')) return;
  await ledger.loadDemo(); refreshSnapshot();
};
window.exportLedger = () => exportJSON(ledger.rows);
window.importLedger = inp => {
  const f = inp.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = async () => {
    try {
      const rows = JSON.parse(rd.result);
      if (Array.isArray(rows)) { await ledger.replace(rows); refreshSnapshot(); }
      else alert('格式不对');
    } catch (e) { alert('解析失败'); }
  };
  rd.readAsText(f); inp.value = '';
};
window.resetLedger = async () => {
  if (!confirm('清空全部流水?')) return;
  await ledger.replace([]); refreshSnapshot();
};

function renderLedger() {
  if (!$('lf-date').value) $('lf-date').value = todayStr();
  const names = { dividend: D.symbols.dividend.name.split(' ')[0], games: D.symbols.games.name.split(' ')[0], cash: '现金' };
  let rows = '<tr><th>日期</th><th>标的</th><th>动作</th><th>价格</th><th>股数/金额</th><th>费</th><th>备注</th><th></th></tr>';
  const rev = ledger.rows.slice().reverse();
  if (!rev.length) rows += '<tr><td colspan="8" class="mini">空——先记一笔[入金],再记买入;或点[载入演示数据]体验</td></tr>';
  for (const r of rev) {
    rows += '<tr><td>' + r.date + '</td><td>' + (names[r.etf] || r.etf) + '</td><td>' + r.act + '</td>'
      + '<td>' + (r.act === '入金' ? '—' : r.price) + '</td><td>' + r.shares + '</td><td>' + (r.fee || 0) + '</td>'
      + '<td class="mini">' + (r.note || '') + '</td>'
      + '<td><span class="del" onclick="delLedger(\'' + r.id + '\')">✕</span></td></tr>';
  }
  $('ledger-table').innerHTML = rows;
  $('cash-warn').textContent = SP.L.cash < 0 ? '⚠️现金为负:流水不完整,检查入金/卖出是否漏记' : '';
}

function renderPF() {
  const L = SP.L, h = SP.h, g = SP.g;
  const dVal = L.dividend.sh * h, gVal = L.games.sh * g;
  const tot = dVal + gVal + L.cash;
  if (tot <= 0) { $('pf').innerHTML = '<div class="mini" style="padding:20px 0">记录流水后这里显示持仓/成本/盈亏</div>'; return; }
  const w = { d: dVal / tot, g: gVal / tot, c: L.cash / tot };
  const rw = D.stats.rec_weights;
  const pl = (pnl, pct) => '<span class="' + (pnl >= 0 ? 'up' : 'down') + '">' + fmt.pct(pct) + ' / ' + (pnl >= 0 ? '+' : '') + pnl.toFixed(0) + '元</span>';
  $('pf').innerHTML =
    '<div class="pf-grid">'
    + '<div class="pf-item"><div class="t">' + D.symbols.dividend.name + ' · ' + L.dividend.sh + '股</div><div class="v">' + fmt.money(dVal) + '</div>'
    + '<div class="mini">加权成本 ' + L.dividend.cost.toFixed(4) + '<br>浮盈 ' + (L.dividend.sh ? pl((h - L.dividend.cost) * L.dividend.sh, (h / L.dividend.cost - 1) * 100) : '—') + '</div></div>'
    + '<div class="pf-item"><div class="t">' + D.symbols.games.name + ' · ' + L.games.sh + '股</div><div class="v">' + fmt.money(gVal) + '</div>'
    + '<div class="mini">加权成本 ' + L.games.cost.toFixed(4) + '<br>浮盈 ' + (L.games.sh ? pl((g - L.games.cost) * L.games.sh, (g / L.games.cost - 1) * 100) : '—') + '</div></div>'
    + '<div class="pf-item"><div class="t">现金</div><div class="v">' + fmt.money(L.cash) + '</div>'
    + '<div class="mini">已实现盈亏 ' + (L.realized >= 0 ? '+' : '') + L.realized.toFixed(0) + '元</div></div>'
    + '<div class="pf-item"><div class="t">总资产</div><div class="v">' + fmt.money(tot) + '</div>'
    + '<div class="mini">压舱' + (w.d * 100).toFixed(0) + '% / 进攻' + (w.g * 100).toFixed(0) + '% / 现金' + (w.c * 100).toFixed(0) + '%'
    + '<br>推荐:压舱' + (rw.dividend * 100).toFixed(0) + '%/进攻' + (rw.games * 100).toFixed(0) + '%/现金' + (rw.cash * 100).toFixed(0) + '%'
    + '<br>' + (w.g < rw.games - 0.05 ? '⬆️进攻仓欠配——两档条件单成交即到位' : (w.g > rw.games + 0.05 ? '⬇️进攻仓超配' : '✅配置在推荐区间')) + '</div></div></div>';
}

// ------------------------------------------------------------------
// 胜率面板
// ------------------------------------------------------------------
function zoneOf(pos, key) {
  const cuts = ZONE_CUTS[key];
  const table = key === 'dividend' ? D.stats.dividend_zones : D.stats.games_zones;
  const idx = cuts.reduce((a, c) => a + (pos > c ? 1 : 0), 0);
  return table[idx];
}
window.setP = v => { P_REPAIR = v; localStorage.setItem(LS_P, v); renderWR(); };

function renderWR() {
  const st = D.stats.system, L = SP.L;
  const h = SP.h, g = SP.g;
  const dVal = L.dividend.sh * h, gVal = L.games.sh * g;
  const tot = dVal + gVal + L.cash;
  const zD = zoneOf(SP.chD.last.pos, 'dividend');
  const ge = D.stats.games_events;
  const evDyn = tot > 0 && zD ? (dVal / tot) * (zD[2] || 0) + (gVal / tot) * (ge.escheme_avg || 0) + (L.cash / tot) * 0.015 : 0;
  const evMoney = tot * evDyn;
  const ma20 = SP.ma20;
  const flags = [
    ['上证>证伪线', SP.s > D.rules.games.sse_stop],
    ['上证>MA20', SP.s > ma20],
    ['进攻仓>-1σ', SP.chG.last.pos > -1],
    ['压舱仓>-0.4σ', SP.chD.last.pos > -0.4],
  ];
  const nOk = flags.filter(f => f[1]).length;
  const pSug = nOk >= 3 ? 65 : nOk === 2 ? 55 : nOk === 1 ? 45 : 35;
  const ev = st.mid + (st.late - st.mid) * P_REPAIR / 100;
  const zones = D.stats.dividend_zones.map(z =>
    '<tr' + (z === zD ? ' style="background:#1e293b88"' : '') + '><td>' + z[0] + '</td><td>' + ((z[1] || 0) * 100).toFixed(0) + '%</td><td>' + fmt.pct((z[2] || 0) * 100, 1) + '</td><td>' + z[3] + '</td></tr>').join('');
  const gz = D.stats.games_zones.map(z =>
    '<tr><td>' + z[0] + '</td><td>' + ((z[1] || 0) * 100).toFixed(0) + '%</td><td>' + fmt.pct((z[2] || 0) * 100, 1) + '</td><td>' + z[3] + '</td></tr>').join('');
  $('wr').innerHTML =
    '<div class="big">'
    + '<div class="kv"><div class="k">系统胜率(' + st.n + '锚点·当前计划)</div><div class="v">' + (st.win * 100).toFixed(0) + '%</div></div>'
    + '<div class="kv"><div class="k">95%CI</div><div class="v" style="font-size:15px">[' + (st.ci[0] * 100).toFixed(0) + '%~' + (st.ci[1] * 100).toFixed(0) + '%]</div></div>'
    + '<div class="kv"><div class="k">12月平均</div><div class="v up">' + fmt.pct(st.avg * 100, 1) + '</div></div>'
    + '<div class="kv"><div class="k">最差锚点</div><div class="v down">' + fmt.pct(st.worst * 100, 1) + '</div></div></div>'
    + '<div class="grid2"><div>'
    + '<div class="lbl">资产层 · 随行情实时查表</div>'
    + (zD ? '<div class="zone"><span class="zname">压舱仓 ' + SP.chD.last.pos.toFixed(2) + 'σ</span>'
      + '<span class="mini">' + zD[0] + ' →</span><b class="up">' + ((zD[1] || 0) * 100).toFixed(0) + '%</b>'
      + '<span class="mini">平均' + fmt.pct((zD[2] || 0) * 100, 1) + ' (n=' + zD[3] + ')</span></div>' : '')
    + '<div class="zone"><span class="zname">进攻仓 ' + SP.chG.last.pos.toFixed(2) + 'σ</span>'
    + '<span class="mini">入场结构' + ge.n + '事件 →</span><b class="up">' + ((ge.escheme_win || 0) * 100).toFixed(0) + '%</b>'
    + '<span class="mini">平均' + fmt.pct((ge.escheme_avg || 0) * 100, 1) + '(E方案)</span></div>'
    + (tot > 0 ? '<div class="lbl">组合期望(动态加权)</div>'
      + '<div>EV ≈ 压舱' + (dVal / tot * 100).toFixed(0) + '%×' + fmt.pct((zD ? zD[2] : 0) * 100, 1) + ' + 进攻' + (gVal / tot * 100).toFixed(0) + '%×' + fmt.pct((ge.escheme_avg || 0) * 100, 1) + ' + 现金' + (L.cash / tot * 100).toFixed(0) + '%×1.5%'
      + ' = <b class="' + (evDyn >= 0 ? 'up' : 'down') + '">' + fmt.pct(evDyn * 100, 1) + '</b> ≈ <b>' + (evMoney >= 0 ? '+' : '') + evMoney.toFixed(0) + '元</b></div>'
      + '<div class="mini" style="margin-top:3px">注:各资产胜率不独立(同涨同跌),组合胜率以系统层' + (st.win * 100).toFixed(0) + '%为准;EV为线性近似,偏乐观</div>' : '')
    + '<div class="lbl">行情温度(启发式·非预测)</div>'
    + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px">'
    + flags.map(f => '<span class="flag ' + (f[1] ? 'ok' : 'no') + '">' + (f[1] ? '✓' : '✗') + ' ' + f[0] + '</span>').join('') + '</div>'
    + '<div class="mini">' + nOk + '/4 修复迹象 → 建议 P(修复)≈' + pSug + '%'
    + ' <button class="sm ghost" onclick="setP(' + pSug + ')">应用到滑块</button></div>'
    + '</div><div>'
    + '<div class="lbl">情境模拟(拖动自检)</div>'
    + '<div class="mini">EV = 中段 ' + fmt.pct(st.mid * 100, 1) + ' × P(中段重演) + 尾段 ' + fmt.pct(st.late * 100, 1) + ' × P(修复)</div>'
    + '<div style="display:flex;align-items:center;gap:10px;margin:8px 0">'
    + '<span class="mini" style="white-space:nowrap">P(修复)</span>'
    + '<input type="range" min="0" max="100" value="' + P_REPAIR + '" style="flex:1" '
    + 'oninput="setP(+this.value)">'
    + '<b style="width:46px">' + P_REPAIR + '%</b></div>'
    + '<div>P=' + P_REPAIR + '%时组合期望 <b class="' + (ev >= 0 ? 'up' : 'down') + '">' + fmt.pct(ev * 100, 1) + '</b>' + (tot > 0 ? ' ≈ <b>' + (tot * ev >= 0 ? '+' : '') + (tot * ev).toFixed(0) + '元</b>(按总资产' + fmt.money(tot) + ')' : '') + '</div>'
    + '<div class="mini" style="margin-top:4px">胜率来自规则(止损锚指数+阶梯止盈+两段加仓),不来自预测;P=50%时EV仍约+' + ((st.mid + (st.late - st.mid) * 0.5) * 100).toFixed(1) + '%——系统不把运气当前提</div>'
    + '<div class="lbl" style="margin-top:10px">压舱仓分区胜率(月线通道)</div>'
    + '<table><tr><th>σ区间</th><th>12月胜率</th><th>平均</th><th>n</th></tr>' + zones + '</table>'
    + '<div class="lbl">进攻仓分区胜率 <span class="mini">' + D.stats.games_zones_note + '</span></div>'
    + '<table><tr><th>σ区间</th><th>胜率</th><th>平均</th><th>n</th></tr>' + gz + '</table>'
    + '</div></div>'
    + '<div class="mini" style="margin-top:6px">' + st.note + '。' + ge.note + '。历史统计不构成投资建议。</div>';
}

// ------------------------------------------------------------------
// 追涨决策面板
// ------------------------------------------------------------------
function renderChase() {
  const mt = D.stats.mode_table, ce = D.stats.chase_events;
  const rows = mt.map((m, i) =>
    '<tr' + (i === mt.length - 1 ? ' style="background:#052e2166"' : '') + '><td>' + m[0] + '</td><td>' + ((m[1] || 0) * 100).toFixed(0) + '%</td>'
    + '<td class="up">' + fmt.pct((m[2] || 0) * 100, 1) + '</td><td class="' + ((m[3] || 0) < 0 ? 'down' : 'flat') + '">' + fmt.pct((m[3] || 0) * 100, 1) + '</td></tr>').join('');
  $('chase').innerHTML =
    '<div class="grid2eq"><div>'
    + '<table><tr><th>加仓方式(同一系统·' + D.stats.system.n + '锚点)</th><th>胜率</th><th>平均</th><th>最差</th></tr>' + rows + '</table>'
    + '<div class="mini">' + D.stats.mode_note + '</div></div>'
    + '<div>'
    + '<div class="lbl">单独检验:低区突破追涨事件</div>'
    + '<div class="mini">进攻标的历史上' + ce.n + '次"MA250下方创20日新高":12月胜率<b class="up">' + ((ce.win || 0) * 100).toFixed(0) + '%</b>·平均<b class="up">' + fmt.pct((ce.avg || 0) * 100, 1) + '</b>(n=' + ce.n + ',一轮熊市样本)</div>'
    + '<div class="mini">其中' + ce.fail_n + '次曾跌回突破价下方——最终仍' + ((ce.fail_win || 0) * 100).toFixed(0) + '%胜:突破失败≠剧本失败(止损只认指数证伪线)</div>'
    + '<div class="mini">但追涨者要坐过山车:12月内中位回踩<b class="down">' + ((ce.dip_med || 0) * 100).toFixed(0) + '%</b>·最深<b class="down">' + ((ce.dip_worst || 0) * 100).toFixed(0) + '%</b></div>'
    + '<div style="margin-top:8px;padding:8px 10px;background:#07231b;border-radius:8px;font-size:12.5px">'
    + '<b>结论:可以追,但要"确认后追"</b><br>'
    + '① 追涨比死等回踩期望更高,胜率不变——追涨不降低系统质量;<br>'
    + '② 采用两段式:回踩档 + 周收盘确认后追涨档,孰先到孰成交;<br>'
    + '③ 不追"中间态"(既没回踩也没突破的位置)——既无折价也无确认;<br>'
    + '④ 追进去后要有坐' + ((ce.dip_med || 0) * 100).toFixed(0) + '%回撤的觉悟,止损线依然只认指数证伪线。</div>'
    + '</div></div>';
}

function renderFooter() {
  const st = D.stats.system;
  $('ft').innerHTML =
    '数据源:腾讯行情(实时+复权K线) · 通道=月线' + 36 + '月滚动OLS(log价)+±1σ残差带(滚动=无未来函数) · 压舱仓通道用后复权(含分红再投),进攻仓用前复权<br>'
    + '流水账=本机SQLite(可导出JSON备份) · 历史与回测数据生成:' + D.updated + '(重启服务或等待缓存过期自动刷新;实时价每' + (POLL_MS / 1000) + '秒轮询)<br>'
    + '口径与局限:系统胜率' + (st.win * 100).toFixed(0) + '%为' + st.n + '锚点样本内数字(CI ' + (st.ci[0] * 100).toFixed(0) + '~' + (st.ci[1] * 100).toFixed(0) + '%)·样本=一轮熊市·E方案假设板块与指数破位同步·追涨结论n=' + D.stats.chase_events.n + '为极小样本。<b>本工具仅为个人研究用途,不构成投资建议。</b>';
}

// ------------------------------------------------------------------
// 启动与轮询
// ------------------------------------------------------------------
function refreshSnapshot() { SP = snapshot(); render(); }
async function refresh() {
  try { live = await api.quotes(); liveOk = true; }
  catch (e) { liveOk = false; }
  refreshSnapshot();
}

(async function main() {
  try {
    D = await api.data();
    await ledger.load();
  } catch (e) {
    $('loading').innerHTML = '<div style="color:#f87171;font-size:14px">加载失败: ' + e.message + '<br><br>请确认后端服务已启动(run.sh),且能访问行情接口。</div>';
    return;
  }
  $('loading').style.display = 'none';
  $('app').style.display = 'block';
  await refresh();
  setInterval(refresh, POLL_MS);
})();
