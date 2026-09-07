// 图表引擎:蜡烛图+成交量+通道带+作战位(TradingView式)
const C = { up: '#ef5350', down: '#26a69a', grid: '#1f2735', txt: '#787b86', cross: '#4a5568' };

export function drawChart(containerId, o) {
  const el = document.getElementById(containerId);
  const W = Math.max(el.clientWidth || 920, 620);
  const H = o.height || 430;
  const M = { l: 8, r: 150, t: 26, b: 52 };   // b含成交量区
  const VH = 64;                                // 成交量区高
  const today = new Date().toISOString().slice(0, 10);
  // 数据:优先OHLC,退化用收盘线
  const useCandle = !!(o.ohlc && o.ohlc.length);
  const rows = useCandle ? o.ohlc.slice() : o.daily.slice();
  const cidx = useCandle ? 4 : 1;  // 收盘位置
  if (o.live != null && rows[rows.length - 1][0] !== today) {
    const p = rows[rows.length - 1], q = p.slice();
    if (useCandle) { q[1] = q[4] = o.live; q[2] = Math.max(q[2], o.live); q[3] = Math.min(q[3], o.live); }
    else q[1] = o.live;
    q[0] = today; rows.push(q);
  }
  const t = s => new Date(s + 'T00:00:00').getTime();
  const n = rows.length;
  const t0 = t(rows[0][0]), t1 = t(rows[n - 1][0]) + 1.5 * 864e5;
  const span = (t1 - t0) || 1;
  const bw = Math.max((W - M.l - M.r) / n * 0.62, 1.1);   // 蜡烛宽
  const X = tv => M.l + (tv - t0) / span * (W - M.l - M.r);
  const chan = o.chan || [];
  // y范围:蜡烛高低 + 通道 + 作战位 + 成本
  const allP = [];
  for (const r of rows) {
    if (useCandle) { allP.push(r[2], r[3]); } else allP.push(r[1]);
  }
  for (const c of chan) allP.push(c.u1, c.l2);
  for (const L of (o.levels || [])) if (L.p != null) allP.push(L.p);
  if (o.cost) allP.push(o.cost);
  let ymin = Math.min(...allP), ymax = Math.max(...allP);
  const pad = (ymax - ymin) * 0.05; ymin -= pad; ymax += pad;
  const PH = H - M.t - M.b - VH - 8;
  const PY = v => M.t + (ymax - v) / (ymax - ymin) * PH;
  const vmax = Math.max(...rows.map(r => r[5] || 0), 1);
  const VY = v => H - M.b - v / vmax * VH;
  const yfmt = o.yfmt || (v => v.toFixed(3));
  const UP = o.cnColor !== false;   // 中式:红涨绿跌

  let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="background:#131722;border-radius:10px">`;
  // 价格网格+右侧刻度
  for (let i = 0; i <= 5; i++) {
    const v = ymin + (ymax - ymin) * i / 5, y = PY(v);
    s += `<line x1="${M.l}" y1="${y}" x2="${W - M.r}" y2="${y}" stroke="${C.grid}" stroke-width="1"/>`
      + `<text x="${W - M.r + 6}" y="${y + 4}" fill="${C.txt}" font-size="10.5" font-family="Menlo,monospace">${yfmt(v)}</text>`;
  }
  // 成交量区分隔+刻度
  const vy0 = H - M.b;
  s += `<line x1="${M.l}" y1="${vy0 - VH - 6}" x2="${W - M.r}" y2="${vy0 - VH - 6}" stroke="${C.grid}"/>`
    + `<text x="${W - M.r + 6}" y="${vy0 - VH + 4}" fill="#565d6b" font-size="9">量</text>`;
  // 时间轴
  for (let i = 0; i < 7; i++) {
    const idx = Math.floor(i * (n - 1) / 6);
    s += `<text x="${X(t(rows[idx][0]))}" y="${H - 8}" fill="${C.txt}" font-size="10" text-anchor="middle">${rows[idx][0].slice(2, 7)}</text>`;
  }
  const rightLabels = [];
  // 通道带
  if (chan.length) {
    const pts = k => chan.map(c => X(t(c.d + '-15')) + ',' + PY(c[k])).join(' ');
    const fill = chan.map(c => X(t(c.d + '-15')) + ',' + PY(c.u1)).join(' ') + ' ' +
      chan.slice().reverse().map(c => X(t(c.d + '-15')) + ',' + PY(c.l1)).join(' ');
    s += `<polygon points="${fill}" fill="#2962ff0f"/>`;
    s += `<polyline points="${pts('u1')}" fill="none" stroke="${C.up}66" stroke-width="1" stroke-dasharray="5 4"/>`;
    s += `<polyline points="${pts('l1')}" fill="none" stroke="${C.down}66" stroke-width="1" stroke-dasharray="5 4"/>`;
    s += `<polyline points="${pts('l2')}" fill="none" stroke="${C.down}33" stroke-width="1" stroke-dasharray="2 4"/>`;
    s += `<polyline points="${pts('mid')}" fill="none" stroke="#2962ff" stroke-width="1.3"/>`;
    const lc = chan[chan.length - 1], lx = X(t(lc.d + '-15'));
    for (const [k, c] of [['u1', C.up + '66'], ['l1', C.down + '66'], ['mid', '#2962ff99']]) {
      s += `<line x1="${lx}" y1="${PY(lc[k])}" x2="${W - M.r}" y2="${PY(lc[k])}" stroke="${c}" stroke-width="1" stroke-dasharray="2 3"/>`;
    }
    rightLabels.push([PY(lc.mid), '#2962ff', '中轨 ' + yfmt(lc.mid)]);
    rightLabels.push([PY(lc.u1), C.up, '+1σ ' + yfmt(lc.u1)]);
    rightLabels.push([PY(lc.l1), C.down, '-1σ ' + yfmt(lc.l1)]);
  }
  // MA20
  if (o.ma20) {
    const cl = rows.map(r => r[cidx]);
    const pt = i => i >= 20 ? X(t(rows[i][0])) + ',' + PY(cl.slice(i - 20, i).reduce((a, b) => a + b, 0) / 20) : '';
    s += `<polyline points="${cl.map((_, i) => pt(i)).filter(Boolean).join(' ')}" fill="none" stroke="#fbbf24" stroke-width="1.1" opacity=".75"/>`;
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
      s += `<rect x="${x - bw / 2}" y="${y1}" width="${bw}" height="${Math.max(y2 - y1, 1)}" fill="${up ? col : '#131722'}" stroke="${col}" stroke-width="${up ? 0 : 1}" rx="${Math.min(bw / 4, 1.5)}"/>`;
      if (vol) s += `<rect x="${x - bw / 2}" y="${VY(vol)}" width="${bw}" height="${vy0 - VY(vol)}" fill="${col}" opacity=".32"/>`;
    }
  } else {
    s += `<polyline points="${rows.map(r => X(t(r[0])) + ',' + PY(r[1])).join(' ')}" fill="none" stroke="#e8edf5" stroke-width="1.6"/>`;
  }
  // 实时价标签(左侧大字)
  if (o.live != null) {
    const x = X(t(rows[n - 1][0])), y = PY(o.live);
    const col = n > 1 && o.live >= rows[n - 2][cidx] ? C.up : C.down;
    s += `<circle cx="${x}" cy="${y}" r="3.2" fill="#fff"><animate attributeName="r" values="3.2;5;3.2" dur="2s" repeatCount="indefinite"/></circle>`
      + `<rect x="${M.l + 2}" y="${y - 9}" width="${(yfmt(o.live) + '').length * 7 + 10}" height="18" rx="4" fill="${col}"/>`
      + `<text x="${M.l + 8}" y="${y + 4.5}" fill="#fff" font-size="11.5" font-weight="700" font-family="Menlo,monospace">${yfmt(o.live)}</text>`;
  }
  // 作战位
  for (const L of (o.levels || [])) {
    if (L.p == null) continue;
    s += `<line x1="${M.l}" y1="${PY(L.p)}" x2="${W - M.r}" y2="${PY(L.p)}" stroke="${L.color}" stroke-width="${L.w || 1.5}" ${L.dash ? `stroke-dasharray="${L.dash}"` : ''} opacity=".9"/>`;
    rightLabels.push([PY(L.p), L.color, L.label]);
  }
  // 成本线
  if (o.cost) {
    s += `<line x1="${M.l}" y1="${PY(o.cost)}" x2="${W - M.r}" y2="${PY(o.cost)}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="7 4"/>`;
    rightLabels.push([PY(o.cost), '#94a3b8', '成本 ' + o.cost.toFixed(3)]);
  }
  // 右侧标签碰撞避让
  rightLabels.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < rightLabels.length; i++) {
    if (rightLabels[i][0] - rightLabels[i - 1][0] < 12.5) rightLabels[i][0] = rightLabels[i - 1][0] + 12.5;
  }
  for (const [y, c, lab] of rightLabels) {
    if (y < M.t + 8 || y > H - M.b - VH - 14) continue;
    s += `<text x="${W - M.r + 6}" y="${y + 3.5}" fill="${c}" font-size="10" font-weight="600">${lab}</text>`;
  }
  s += `<line id="${containerId}-cross" x1="0" x2="0" y1="${M.t}" y2="${vy0}" stroke="${C.cross}" stroke-width="1" visibility="hidden"/>`;
  s += `</svg><div class="tip"></div>`;
  el.innerHTML = s;
  // 悬停:十字线+OHLC提示
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
        + `量 ${(rw[5] / 1e4).toFixed(0)}万`;
    } else {
      tip.innerHTML = `<b>${rw[0]}</b> · <b>${yfmt(rw[1])}</b> <span style="color:${cc}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span>`;
    }
    tip.style.left = Math.min(Math.max(e.clientX - r.left + 14, 0), r.width - 180) + 'px';
    tip.style.top = (e.clientY - r.top - 36) + 'px';
  });
  svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; cross.setAttribute('visibility', 'hidden'); });
}

// 迷你走势图(报价卡用)
export function drawSpark(containerId, closesArr, color) {
  const el = document.getElementById(containerId);
  if (!el || !closesArr.length) return;
  const W = el.clientWidth || 110, H = el.clientHeight || 34;
  const vmin = Math.min(...closesArr), vmax = Math.max(...closesArr);
  const X = i => i / (closesArr.length - 1 || 1) * (W - 2) + 1;
  const Y = v => H - 3 - (v - vmin) / (vmax - vmin || 1) * (H - 6);
  const pts = closesArr.map((v, i) => X(i) + ',' + Y(v)).join(' ');
  const up = closesArr[closesArr.length - 1] >= closesArr[0];
  const c = color || (up ? C.up : C.down);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:100%;display:block">
    <polyline points="${pts}" fill="none" stroke="${c}" stroke-width="1.4"/>
    <circle cx="${X(closesArr.length - 1)}" cy="${Y(closesArr[closesArr.length - 1])}" r="2" fill="${c}"/></svg>`;
}

// 折线图(账户收益曲线等):series=[{name,color,points:[[date,val]...]}]
export function drawCurve(containerId, o) {
  const el = document.getElementById(containerId);
  const W = Math.max(el.clientWidth || 920, 640), H = o.height || 300;
  const M = { l: 58, r: 16, t: 16, b: 26 };
  const t = s => new Date(s + 'T00:00:00').getTime();
  const all = o.series.flatMap(s => s.points.map(p => p[1]));
  const t0 = t(o.series[0].points[0][0]), t1 = t(o.series[0].points[o.series[0].points.length - 1][0]);
  let ymin = Math.min(...all), ymax = Math.max(...all);
  const pad = (ymax - ymin) * 0.06 || 1; ymin -= pad; ymax += pad;
  const X = tv => M.l + (tv - t0) / (t1 - t0 || 1) * (W - M.l - M.r);
  const Y = v => M.t + (ymax - v) / (ymax - ymin) * (H - M.t - M.b);
  const yfmt = o.yfmt || (v => v.toFixed(0));
  let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="background:#131722;border-radius:10px">`;
  for (let i = 0; i <= 4; i++) {
    const v = ymin + (ymax - ymin) * i / 4, y = Y(v);
    s += `<line x1="${M.l}" y1="${y}" x2="${W - M.r}" y2="${y}" stroke="${C.grid}"/>`
      + `<text x="${M.l - 7}" y="${y + 4}" fill="${C.txt}" font-size="11" text-anchor="end">${yfmt(v)}</text>`;
  }
  const pts = o.series[0].points;
  for (let i = 0; i < 7; i++) {
    const idx = Math.floor(i * (pts.length - 1) / 6);
    s += `<text x="${X(t(pts[idx][0]))}" y="${H - 7}" fill="${C.txt}" font-size="10.5" text-anchor="middle">${pts[idx][0].slice(2, 7)}</text>`;
  }
  if (o.base != null) {
    s += `<line x1="${M.l}" y1="${Y(o.base)}" x2="${W - M.r}" y2="${Y(o.base)}" stroke="#64748b" stroke-width="1" stroke-dasharray="6 4"/>`
      + `<text x="${M.l + 4}" y="${Y(o.base) - 5}" fill="#94a3b8" font-size="10.5">${o.baseLabel || '基准'}</text>`;
  }
  for (const se of o.series) {
    const path = se.points.map(p => X(t(p[0])) + ',' + Y(p[1])).join(' ');
    s += `<polyline points="${path}" fill="none" stroke="${se.color}" stroke-width="${se.width || 1.7}" stroke-linejoin="round" ${se.dash ? `stroke-dasharray="${se.dash}"` : ''}/>`;
  }
  const lastPt = o.series[0].points[o.series[0].points.length - 1];
  s += `<circle cx="${X(t(lastPt[0]))}" cy="${Y(lastPt[1])}" r="3.5" fill="#fff"/>`;
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
    tip.style.left = Math.min(Math.max(e.clientX - r.left + 14, 0), r.width - 170) + 'px';
    tip.style.top = (e.clientY - r.top - 34) + 'px';
  });
  svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
}
