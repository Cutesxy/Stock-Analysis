// 图表引擎:蜡烛+成交量+通道+作战位(浅色行情风·图例条版)
const C = { up: '#e02e44', down: '#0a9969', grid: '#e8edf4', txt: '#7a8494', cross: '#b6bfcc', accent: '#1666dc' };
const CHART_BG = '#ffffff';

export function drawChart(containerId, o) {
  const el = document.getElementById(containerId);
  const W = Math.max(el.clientWidth || 920, 620);
  const H = o.height || 520;
  const M = { l: 10, r: 64, t: 16, b: 56 };
  const VH = 58;
  const today = new Date().toISOString().slice(0, 10);
  const useCandle = !!(o.ohlc && o.ohlc.length);
  const rows = useCandle ? o.ohlc.slice() : o.daily.slice();
  const cidx = useCandle ? 4 : 1;
  if (o.live != null && rows[rows.length - 1][0] !== today) {
    const p = rows[rows.length - 1], q = p.slice();
    if (useCandle) { q[1] = q[4] = o.live; q[2] = Math.max(q[2], o.live); q[3] = Math.min(q[3], o.live); q[5] = 0; }
    else q[1] = o.live;
    q[0] = today; rows.push(q);
  }
  const t = s => new Date(s + 'T00:00:00').getTime();
  const n = rows.length;
  const t0 = t(rows[0][0]), t1 = t(rows[n - 1][0]) + 1.5 * 864e5;
  const span = (t1 - t0) || 1;
  const bw = Math.max((W - M.l - M.r) / n * 0.62, 1.1);
  const X = tv => M.l + (tv - t0) / span * (W - M.l - M.r);
  // 通道只画窗口内的点(否则y轴被窗口外旧值撑开)
  const chan = (o.chan || []).filter(c => t(c.d + '-15') >= t0 - 45 * 864e5);
  const allP = [];
  for (const r of rows) { if (useCandle) { allP.push(r[2], r[3]); } else allP.push(r[1]); }
  for (const c of chan) allP.push(c.u1, c.l2);
  for (const L of (o.levels || [])) if (L.p != null) allP.push(L.p);
  if (o.cost) allP.push(o.cost);
  let ymin = Math.min(...allP), ymax = Math.max(...allP);
  const pad = (ymax - ymin) * 0.05; ymin -= pad; ymax += pad;
  const PH = H - M.t - M.b - VH - 8;
  const PY = v => M.t + (ymax - v) / (ymax - ymin) * PH;
  const vmax = Math.max(...rows.map(r => r[5] || 0), 1);
  const vy0 = H - M.b;
  const VY = v => vy0 - v / vmax * VH;
  const yfmt = o.yfmt || (v => v.toFixed(3));

  let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="background:${CHART_BG};border-radius:11px">`;
  // 网格+右侧价格刻度
  for (let i = 0; i <= 5; i++) {
    const v = ymin + (ymax - ymin) * i / 5, y = PY(v);
    s += `<line x1="${M.l}" y1="${y}" x2="${W - M.r}" y2="${y}" stroke="${C.grid}" stroke-width="1"/>`
      + `<text x="${W - M.r + 7}" y="${y + 4}" fill="${C.txt}" font-size="11.5" font-family="Menlo,monospace">${yfmt(v)}</text>`;
  }
  s += `<line x1="${M.l}" y1="${vy0 - VH - 6}" x2="${W - M.r}" y2="${vy0 - VH - 6}" stroke="${C.grid}"/>`;
  // 时间轴
  for (let i = 0; i < 8; i++) {
    const idx = Math.floor(i * (n - 1) / 7);
    s += `<text x="${X(t(rows[idx][0]))}" y="${H - 10}" fill="${C.txt}" font-size="11" text-anchor="middle">${rows[idx][0].slice(2, 7)}</text>`;
  }
  // 通道带
  if (chan.length) {
    const pts = k => chan.map(c => X(t(c.d + '-15')) + ',' + PY(c[k])).join(' ');
    const fill = chan.map(c => X(t(c.d + '-15')) + ',' + PY(c.u1)).join(' ') + ' ' +
      chan.slice().reverse().map(c => X(t(c.d + '-15')) + ',' + PY(c.l1)).join(' ');
    s += `<polygon points="${fill}" fill="${C.accent}0d"/>`;
    s += `<polyline points="${pts('u1')}" fill="none" stroke="${C.up}55" stroke-width="1" stroke-dasharray="5 4"/>`;
    s += `<polyline points="${pts('l1')}" fill="none" stroke="${C.down}55" stroke-width="1" stroke-dasharray="5 4"/>`;
    s += `<polyline points="${pts('l2')}" fill="none" stroke="${C.down}30" stroke-width="1" stroke-dasharray="2 4"/>`;
    s += `<polyline points="${pts('mid')}" fill="none" stroke="${C.accent}" stroke-width="1.3"/>`;
    const lc = chan[chan.length - 1], lx = X(t(lc.d + '-15'));
    for (const [k, c] of [['u1', C.up + '55'], ['l1', C.down + '55'], ['mid', C.accent + '66']]) {
      s += `<line x1="${lx}" y1="${PY(lc[k])}" x2="${W - M.r}" y2="${PY(lc[k])}" stroke="${c}" stroke-width="1" stroke-dasharray="2 3"/>`;
    }
  }
  // MA20
  if (o.ma20) {
    const cl = rows.map(r => r[cidx]);
    const pt = i => i >= 20 ? X(t(rows[i][0])) + ',' + PY(cl.slice(i - 20, i).reduce((a, b) => a + b, 0) / 20) : '';
    s += `<polyline points="${cl.map((_, i) => pt(i)).filter(Boolean).join(' ')}" fill="none" stroke="#d97706" stroke-width="1.2" opacity=".8"/>`;
  }
  // 蜡烛/收盘线 + 成交量
  if (useCandle) {
    for (let i = 0; i < n; i++) {
      const [d, op, hi, lo, cl, vol] = rows[i];
      const x = X(t(d));
      const up = cl >= op;
      const col = up ? C.up : C.down;
      s += `<line x1="${x}" y1="${PY(hi)}" x2="${x}" y2="${PY(lo)}" stroke="${col}" stroke-width="1"/>`;
      const y1 = PY(Math.max(op, cl)), y2 = PY(Math.min(op, cl));
      s += `<rect x="${x - bw / 2}" y="${y1}" width="${bw}" height="${Math.max(y2 - y1, 1)}" fill="${col}" rx="${Math.min(bw / 4, 1.5)}"/>`;
      if (vol) s += `<rect x="${x - bw / 2}" y="${VY(vol)}" width="${bw}" height="${vy0 - VY(vol)}" fill="${col}" opacity=".2"/>`;
    }
  } else {
    s += `<polyline points="${rows.map(r => X(t(r[0])) + ',' + PY(r[1])).join(' ')}" fill="none" stroke="#232a36" stroke-width="1.7"/>`;
  }
  // 作战位(横线,标签进图例)
  for (const L of (o.levels || [])) {
    if (L.p == null) continue;
    s += `<line x1="${M.l}" y1="${PY(L.p)}" x2="${W - M.r}" y2="${PY(L.p)}" stroke="${L.color}" stroke-width="${L.w || 1.5}" ${L.dash ? `stroke-dasharray="${L.dash}"` : ''} opacity=".85"/>`;
  }
  // 成本线(图内唯一文字标签)
  if (o.cost) {
    s += `<line x1="${M.l}" y1="${PY(o.cost)}" x2="${W - M.r}" y2="${PY(o.cost)}" stroke="#98a2b3" stroke-width="1" stroke-dasharray="7 4"/>`
      + `<text x="${M.l + 6}" y="${PY(o.cost) - 5}" fill="#98a2b3" font-size="11">成本 ${o.cost.toFixed(3)}</text>`;
  }
  // 实时价:右侧价格轴气泡
  if (o.live != null) {
    const x = X(t(rows[n - 1][0])), y = PY(o.live);
    const col = n > 1 && o.live >= rows[n - 2][cidx] ? C.up : C.down;
    s += `<circle cx="${x}" cy="${y}" r="3.2" fill="#fff" stroke="${col}" stroke-width="2"><animate attributeName="r" values="3.2;5;3.2" dur="2s" repeatCount="indefinite"/></circle>`;
    const by = Math.max(M.t + 10, Math.min(y, vy0 - VH - 12));
    const bw2 = (yfmt(o.live) + '').length * 7.5 + 12;
    s += `<rect x="${W - M.r + 2}" y="${by - 9}" width="${bw2}" height="18" rx="4" fill="${col}"/>`
      + `<text x="${W - M.r + 8}" y="${by + 4.5}" fill="#fff" font-size="11.5" font-weight="700" font-family="Menlo,monospace">${yfmt(o.live)}</text>`;
  }
  s += `<line id="${containerId}-cross" x1="0" x2="0" y1="${M.t}" y2="${vy0}" stroke="${C.cross}" stroke-width="1" visibility="hidden"/>`;
  s += `</svg>`;

  // ---------- 图例条 ----------
  const lg = [];
  for (const L of (o.levels || [])) if (L.p != null) lg.push([L.color, L.label]);
  if (chan.length) {
    const lc = chan[chan.length - 1];
    lg.push([C.accent, '中轨 ' + yfmt(lc.mid)], [C.up, '+1σ ' + yfmt(lc.u1)], [C.down, '-1σ ' + yfmt(lc.l1)]);
  }
  if (o.ma20) lg.push(['#d97706', 'MA20']);
  if (o.cost) lg.push(['#98a2b3', '成本 ' + o.cost.toFixed(3)]);
  const legend = lg.length ? `<div class="clegend">${lg.map(([c, t2]) => `<span class="li"><i style="background:${c}"></i>${t2}</span>`).join('')}</div>` : '';
  el.innerHTML = s + legend + `<div class="tip"></div>`;

  // 悬停:十字线+OHLC
  const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), cross = el.querySelector('#' + containerId + '-cross');
  svg.addEventListener('mousemove', e => {
    const r = svg.getBoundingClientRect();
    const vx = (e.clientX - r.left) * (W / r.width);
    if (vx < M.l || vx > W - M.r) { tip.style.display = 'none'; cross.setAttribute('visibility', 'hidden'); return; }
    const tv = t0 + (vx - M.l) / (W - M.l - M.r) * span;
    let best = 0, bd = 1e18;
    for (let i = 0; i < n; i++) { const d = Math.abs(t(rows[i][0]) - tv); if (d < bd) { bd = d; best = i; } }
    const px = X(t(rows[best][0]));
    cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
    const rw = rows[best];
    const chg = best > 0 ? (rw[cidx] / rows[best - 1][cidx] - 1) * 100 : 0;
    const cc = chg >= 0 ? C.up : C.down;
    tip.style.display = 'block';
    if (useCandle) {
      tip.innerHTML = `<b>${rw[0]}</b> <span style="color:${cc}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span><br>`
        + `开 <b>${yfmt(rw[1])}</b> 高 <b style="color:${C.up}">${yfmt(rw[2])}</b><br>`
        + `低 <b style="color:${C.down}">${yfmt(rw[3])}</b> 收 <b>${yfmt(rw[4])}</b><br>`
        + `量 ${rw[5] ? (rw[5] / 1e4).toFixed(0) + '万' : '—'}`;
    } else {
      tip.innerHTML = `<b>${rw[0]}</b> · <b>${yfmt(rw[1])}</b> <span style="color:${cc}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span>`;
    }
    tip.style.left = Math.min(Math.max(e.clientX - r.left + 14, 0), r.width - 185) + 'px';
    tip.style.top = (e.clientY - r.top - 36) + 'px';
  });
  svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; cross.setAttribute('visibility', 'hidden'); });
}

// 迷你走势图(报价卡用)
export function drawSpark(containerId, closesArr, color) {
  const el = document.getElementById(containerId);
  if (!el || !closesArr.length) return;
  const W = el.clientWidth || 110, H = el.clientHeight || 36;
  const vmin = Math.min(...closesArr), vmax = Math.max(...closesArr);
  const X = i => i / (closesArr.length - 1 || 1) * (W - 2) + 1;
  const Y = v => H - 3 - (v - vmin) / (vmax - vmin || 1) * (H - 6);
  const pts = closesArr.map((v, i) => X(i) + ',' + Y(v)).join(' ');
  const up = closesArr[closesArr.length - 1] >= closesArr[0];
  const c = color || (up ? C.up : C.down);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:100%;display:block">
    <polyline points="${pts}" fill="none" stroke="${c}" stroke-width="1.5"/>
    <circle cx="${X(closesArr.length - 1)}" cy="${Y(closesArr[closesArr.length - 1])}" r="2.2" fill="${c}"/></svg>`;
}

// 折线图(账户收益曲线等)
export function drawCurve(containerId, o) {
  const el = document.getElementById(containerId);
  const W = Math.max(el.clientWidth || 920, 640), H = o.height || 300;
  const M = { l: 58, r: 16, t: 16, b: 28 };
  const t = s => new Date(s + 'T00:00:00').getTime();
  const all = o.series.flatMap(s => s.points.map(p => p[1]));
  const t0 = t(o.series[0].points[0][0]), t1 = t(o.series[0].points[o.series[0].points.length - 1][0]);
  let ymin = Math.min(...all), ymax = Math.max(...all);
  const pad = (ymax - ymin) * 0.06 || 1; ymin -= pad; ymax += pad;
  const X = tv => M.l + (tv - t0) / (t1 - t0 || 1) * (W - M.l - M.r);
  const Y = v => M.t + (ymax - v) / (ymax - ymin) * (H - M.t - M.b);
  const yfmt = o.yfmt || (v => v.toFixed(0));
  let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="background:${CHART_BG};border-radius:11px">`;
  for (let i = 0; i <= 4; i++) {
    const v = ymin + (ymax - ymin) * i / 4, y = Y(v);
    s += `<line x1="${M.l}" y1="${y}" x2="${W - M.r}" y2="${y}" stroke="${C.grid}"/>`
      + `<text x="${M.l - 7}" y="${y + 4}" fill="${C.txt}" font-size="11.5" text-anchor="end" font-family="Menlo,monospace">${yfmt(v)}</text>`;
  }
  const pts = o.series[0].points;
  for (let i = 0; i < 7; i++) {
    const idx = Math.floor(i * (pts.length - 1) / 6);
    s += `<text x="${X(t(pts[idx][0]))}" y="${H - 8}" fill="${C.txt}" font-size="11" text-anchor="middle">${pts[idx][0].slice(2, 7)}</text>`;
  }
  if (o.base != null) {
    s += `<line x1="${M.l}" y1="${Y(o.base)}" x2="${W - M.r}" y2="${Y(o.base)}" stroke="#98a2b3" stroke-width="1" stroke-dasharray="6 4"/>`
      + `<text x="${M.l + 4}" y="${Y(o.base) - 5}" fill="#7a8494" font-size="11">${o.baseLabel || '基准'}</text>`;
  }
  for (const se of o.series) {
    const path = se.points.map(p => X(t(p[0])) + ',' + Y(p[1])).join(' ');
    s += `<polyline points="${path}" fill="none" stroke="${se.color}" stroke-width="${se.width || 1.8}" stroke-linejoin="round" ${se.dash ? `stroke-dasharray="${se.dash}"` : ''}/>`;
  }
  const lastPt = o.series[0].points[o.series[0].points.length - 1];
  s += `<circle cx="${X(t(lastPt[0]))}" cy="${Y(lastPt[1])}" r="3.5" fill="#fff" stroke="${o.series[0].color}" stroke-width="2"/>`;
  s += `</svg><div class="tip"></div>`;
  el.innerHTML = s;
  const svg = el.querySelector('svg'), tip = el.querySelector('.tip');
  svg.addEventListener('mousemove', e => {
    const r = svg.getBoundingClientRect();
    const vx = (e.clientX - r.left) * (W / r.width);
    if (vx < M.l || vx > W - M.r) { tip.style.display = 'none'; return; }
    const tv = t0 + (vx - M.l) / (W - M.l - M.r) * (t1 - t0);
    let best = 0, bd = 1e18;
    for (let i = 0; i < pts.length; i++) { const d = Math.abs(t(pts[i][0]) - tv); if (d < bd) { bd = d; best = i; } }
    tip.style.display = 'block';
    tip.innerHTML = `<b>${pts[best][0]}</b>` + o.series.map(se =>
      `<br><span style="color:${se.color}">●</span> ${se.name}: ${o.tipFmt ? o.tipFmt(se.points[best][1]) : se.points[best][1].toFixed(0)}`).join('');
    tip.style.left = Math.min(Math.max(e.clientX - r.left + 14, 0), r.width - 175) + 'px';
    tip.style.top = (e.clientY - r.top - 34) + 'px';
  });
  svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
}

// 分时图:价格线+均价线(VWAP)+昨收基准+量(经典A股分时)
export function drawIntraday(containerId, o) {
  const el = document.getElementById(containerId);
  const W = Math.max(el.clientWidth || 920, 620);
  const H = o.height || 520;
  const M = { l: 10, r: 64, t: 16, b: 46 };
  const VH = 64;
  const pts = o.points || [];
  if (!pts.length) { el.innerHTML = '<div style="padding:60px;color:#7a8494;text-align:center">暂无分时数据(未开市或数据未生成)</div>'; return; }
  const prev = o.prev != null ? o.prev : pts[0][1];
  // 分钟槽位:上午09:30-11:30(0-120),下午13:00-15:00(121-241)
  const slot = hm => {
    const h = +hm.slice(0, 2), m = +hm.slice(2, 4);
    if (h < 12) return Math.max(0, (h - 9) * 60 + m - 30);
    return 121 + (h - 13) * 60 + m;
  };
  const SLOTS = 242;
  const vy0 = H - M.b;
  // VWAP
  const vwap = [];
  let pv = 0, vv = 0, lastCum = 0;
  const vols = [];
  for (const [, p, cum] of pts) {
    const v = Math.max(cum - lastCum, 0); lastCum = cum;
    vols.push(v); pv += p * v; vv += v;
    vwap.push(vv > 0 ? pv / vv : p);
  }
  const prices = pts.map(r => r[1]);
  const all = prices.concat(vwap, [prev]);
  let ymin = Math.min(...all), ymax = Math.max(...all);
  const pad = (ymax - ymin) * 0.08 || 0.002; ymin -= pad; ymax += pad;
  const PH = H - M.t - M.b - VH - 8;
  const X = i => M.l + (slot(pts[i][0]) / SLOTS) * (W - M.l - M.r);
  const Y = v => M.t + (ymax - v) / (ymax - ymin) * PH;
  const vmax = Math.max(...vols, 1);
  const VY = v => vy0 - v / vmax * VH;
  const yfmt = o.yfmt || (v => v.toFixed(3));
  const up = prices[prices.length - 1] >= prev;

  let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="background:${CHART_BG};border-radius:11px">`;
  // 网格:横5条+竖4条(9:30/10:30/11:30-13:00/14:00/15:00)
  for (let i = 0; i <= 4; i++) {
    const v = ymin + (ymax - ymin) * i / 4, y = Y(v);
    s += `<line x1="${M.l}" y1="${y}" x2="${W - M.r}" y2="${y}" stroke="${C.grid}"/>`
      + `<text x="${W - M.r + 7}" y="${y + 4}" fill="${C.txt}" font-size="11.5" font-family="Menlo,monospace">${yfmt(v)}</text>`;
  }
  const xticks = [['0930', 0], ['1030', 60], ['1130/1300', 120], ['1400', 181], ['1500', SLOTS]];
  for (const [lab, sl] of xticks.slice(0, -1)) {
    const x = M.l + sl / SLOTS * (W - M.l - M.r);
    s += `<line x1="${x}" y1="${M.t}" x2="${x}" y2="${vy0}" stroke="${C.grid}" stroke-dasharray="2 4"/>`
      + `<text x="${x}" y="${H - 10}" fill="${C.txt}" font-size="11" text-anchor="middle">${lab}</text>`;
  }
  const xe = M.l + (W - M.l - M.r);
  s += `<text x="${xe}" y="${H - 10}" fill="${C.txt}" font-size="11" text-anchor="end">15:00</text>`;
  s += `<line x1="${M.l}" y1="${vy0 - VH - 6}" x2="${W - M.r}" y2="${vy0 - VH - 6}" stroke="${C.grid}"/>`;
  // 昨收基准线
  s += `<line x1="${M.l}" y1="${Y(prev)}" x2="${W - M.r}" y2="${Y(prev)}" stroke="#98a2b3" stroke-width="1" stroke-dasharray="6 4"/>`;
  // 量柱(涨红跌绿)
  for (let i = 0; i < pts.length; i++) {
    const x = X(i);
    const col = i > 0 ? (pts[i][1] >= pts[i - 1][1] ? C.up : C.down) : C.up;
    const v = vols[i];
    if (v > 0) s += `<rect x="${x - 1}" y="${VY(v)}" width="2" height="${vy0 - VY(v)}" fill="${col}" opacity=".22"/>`;
  }
  // 均价线(VWAP)
  s += `<polyline points="${vwap.map((v, i) => X(i) + ',' + Y(v)).join(' ')}" fill="none" stroke="#d97706" stroke-width="1.2" opacity=".9"/>`;
  // 价格线
  s += `<polyline points="${prices.map((v, i) => X(i) + ',' + Y(v)).join(' ')}" fill="none" stroke="${C.accent}" stroke-width="1.6"/>`;
  // 现价点+右侧气泡
  const li = pts.length - 1;
  const col = up ? C.up : C.down;
  s += `<circle cx="${X(li)}" cy="${Y(prices[li])}" r="3.4" fill="#fff" stroke="${col}" stroke-width="2"><animate attributeName="r" values="3.4;5.2;3.4" dur="2s" repeatCount="indefinite"/></circle>`;
  const by = Math.max(M.t + 10, Math.min(Y(prices[li]), vy0 - VH - 12));
  const bw2 = (yfmt(prices[li]) + '').length * 7.5 + 12;
  s += `<rect x="${W - M.r + 2}" y="${by - 9}" width="${bw2}" height="18" rx="4" fill="${col}"/>`
    + `<text x="${W - M.r + 8}" y="${by + 4.5}" fill="#fff" font-size="11.5" font-weight="700" font-family="Menlo,monospace">${yfmt(prices[li])}</text>`;
  s += `<line id="${containerId}-cross" x1="0" x2="0" y1="${M.t}" y2="${vy0}" stroke="${C.cross}" stroke-width="1" visibility="hidden"/>`;
  s += `</svg>`;
  // 图例
  const lg = [[C.accent, '价格'], ['#d97706', '均价线'], ['#98a2b3', `昨收 ${yfmt(prev)}`]];
  if (o.date) lg.push(['#b3bdc9', o.date.slice(4, 6) + '-' + o.date.slice(6, 8) + ' 分时']);
  const legend = `<div class="clegend">${lg.map(([c, t2]) => `<span class="li"><i style="background:${c}"></i>${t2}</span>`).join('')}</div>`;
  el.innerHTML = s + legend + `<div class="tip"></div>`;
  // 悬停
  const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), cross = el.querySelector('#' + containerId + '-cross');
  svg.addEventListener('mousemove', e => {
    const r = svg.getBoundingClientRect();
    const vx = (e.clientX - r.left) * (W / r.width);
    if (vx < M.l || vx > W - M.r) { tip.style.display = 'none'; cross.setAttribute('visibility', 'hidden'); return; }
    const sl = (vx - M.l) / (W - M.l - M.r) * SLOTS;
    let best = 0, bd = 1e9;
    for (let i = 0; i < pts.length; i++) { const d = Math.abs(slot(pts[i][0]) - sl); if (d < bd) { bd = d; best = i; } }
    cross.setAttribute('x1', X(best)); cross.setAttribute('x2', X(best)); cross.setAttribute('visibility', 'visible');
    const p = pts[best][1], chg = (p / prev - 1) * 100;
    tip.style.display = 'block';
    tip.innerHTML = `<b>${pts[best][0].slice(0, 2)}:${pts[best][0].slice(2, 4)}</b> · <b>${yfmt(p)}</b> `
      + `<span style="color:${chg >= 0 ? C.up : C.down}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span><br>`
      + `量 ${(vols[best] / 1e4).toFixed(1)}万手`;
    tip.style.left = Math.min(Math.max(e.clientX - r.left + 14, 0), r.width - 185) + 'px';
    tip.style.top = (e.clientY - r.top - 36) + 'px';
  });
  svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; cross.setAttribute('visibility', 'hidden'); });
}
