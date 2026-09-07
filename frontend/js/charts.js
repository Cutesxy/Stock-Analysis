// SVG图表渲染:K线价格线+通道带+作战位+成本线+实时点+悬停十字线
export function drawChart(containerId, o) {
  const el = document.getElementById(containerId);
  const W = Math.max(el.clientWidth || 920, 640), H = 360;
  const M = { l: 54, r: 176, t: 14, b: 26 };
  const today = new Date().toISOString().slice(0, 10);
  const dd = o.daily.slice();
  if (o.live && dd[dd.length - 1][0] !== today) dd.push([today, o.live]);
  const t = s => new Date(s + 'T00:00:00').getTime();
  const t0 = t(dd[0][0]), t1 = t(dd[dd.length - 1][0]) + 2 * 864e5;
  const chan = o.chan || [];
  const allP = dd.map(r => r[1]).concat(chan.map(c => c.u1), chan.map(c => c.l2),
    o.levels.map(l => l.p), o.cost ? [o.cost] : []);
  let ymin = Math.min(...allP), ymax = Math.max(...allP);
  const pad = (ymax - ymin) * 0.045; ymin -= pad; ymax += pad;
  const X = tv => M.l + (tv - t0) / (t1 - t0) * (W - M.l - M.r);
  const Y = v => M.t + (ymax - v) / (ymax - ymin) * (H - M.t - M.b);
  const yfmt = o.yfmt || (v => v.toFixed(3));
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">';
  // 网格
  for (let i = 0; i <= 4; i++) {
    const v = ymin + (ymax - ymin) * i / 4, y = Y(v);
    s += '<line x1="' + M.l + '" y1="' + y + '" x2="' + (W - M.r) + '" y2="' + y + '" stroke="#1c2736"/>'
      + '<text x="' + (M.l - 7) + '" y="' + (y + 4) + '" fill="#8b96a8" font-size="11" text-anchor="end">' + yfmt(v) + '</text>';
  }
  for (let i = 0; i < 7; i++) {
    const idx = Math.floor(i * (dd.length - 1) / 6);
    s += '<text x="' + X(t(dd[idx][0])) + '" y="' + (H - 7) + '" fill="#8b96a8" font-size="10.5" text-anchor="middle">' + dd[idx][0].slice(2, 7) + '</text>';
  }
  // 通道
  const rightLabels = [];
  if (chan.length) {
    const pts = k => chan.map(c => X(t(c.d + '-15')) + ',' + Y(c[k])).join(' ');
    const fill = chan.map(c => X(t(c.d + '-15')) + ',' + Y(c.u1)).join(' ') + ' ' +
      chan.slice().reverse().map(c => X(t(c.d + '-15')) + ',' + Y(c.l1)).join(' ');
    s += '<polygon points="' + fill + '" fill="#3b82f610"/>';
    s += '<polyline points="' + pts('u1') + '" fill="none" stroke="#f8717177" stroke-width="1" stroke-dasharray="5 4"/>';
    s += '<polyline points="' + pts('l1') + '" fill="none" stroke="#34d39977" stroke-width="1" stroke-dasharray="5 4"/>';
    s += '<polyline points="' + pts('l2') + '" fill="none" stroke="#05966944" stroke-width="1" stroke-dasharray="2 4"/>';
    s += '<polyline points="' + pts('mid') + '" fill="none" stroke="#60a5fa" stroke-width="1.4"/>';
    const lc = chan[chan.length - 1], lx = X(t(lc.d + '-15'));
    [['u1', '#f8717177'], ['l1', '#34d39977'], ['mid', '#60a5faAA']].forEach(([k, c]) => {
      s += '<line x1="' + lx + '" y1="' + Y(lc[k]) + '" x2="' + (W - M.r) + '" y2="' + Y(lc[k]) + '" stroke="' + c + '" stroke-width="1" stroke-dasharray="2 3"/>';
    });
    rightLabels.push([Y(lc.mid), '#60a5fa', '中轨 ' + yfmt(lc.mid)]);
    rightLabels.push([Y(lc.u1), '#f87171', '+1σ ' + yfmt(lc.u1)]);
    rightLabels.push([Y(lc.l1), '#34d399', '-1σ ' + yfmt(lc.l1)]);
  }
  // MA20(仅指数)
  if (o.ma20) {
    const vals = dd.map(r => r[1]);
    const pts = vals.map((_, i) => i >= 20 ? X(t(dd[i][0])) + ',' + Y(vals.slice(i - 20, i).reduce((a, b) => a + b, 0) / 20) : '')
      .filter(Boolean).join(' ');
    s += '<polyline points="' + pts + '" fill="none" stroke="#fbbf24" stroke-width="1.1" opacity=".7"/>';
  }
  // 作战位
  for (const L of o.levels) {
    s += '<line x1="' + M.l + '" y1="' + Y(L.p) + '" x2="' + (W - M.r) + '" y2="' + Y(L.p) + '" stroke="' + L.color + '" stroke-width="1.6"' + (L.dash ? ' stroke-dasharray="' + L.dash + '"' : '') + '/>';
    rightLabels.push([Y(L.p), L.color, L.label]);
  }
  // 成本线
  if (o.cost) {
    s += '<line x1="' + M.l + '" y1="' + Y(o.cost) + '" x2="' + (W - M.r) + '" y2="' + Y(o.cost) + '" stroke="#94a3b8" stroke-width="1" stroke-dasharray="7 4"/>'
      + '<text x="' + (M.l + 4) + '" y="' + (Y(o.cost) - 4) + '" fill="#94a3b8" font-size="10.5">成本 ' + o.cost.toFixed(3) + '</text>';
  }
  // 价格线+实时点
  s += '<polyline points="' + dd.map(r => X(t(r[0])) + ',' + Y(r[1])).join(' ') + '" fill="none" stroke="#e8edf5" stroke-width="1.6" stroke-linejoin="round"/>';
  if (o.live) {
    const x = X(t(dd[dd.length - 1][0]));
    s += '<circle cx="' + x + '" cy="' + Y(dd[dd.length - 1][1]) + '" r="4" fill="#fff"><animate attributeName="r" values="4;6;4" dur="2s" repeatCount="indefinite"/></circle>'
      + '<text x="' + (x - 7) + '" y="' + (Y(dd[dd.length - 1][1]) - 10) + '" fill="#fff" font-size="11.5" text-anchor="end" font-weight="700">' + yfmt(o.live) + '</text>';
  }
  // 右侧标签(碰撞避让)
  rightLabels.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < rightLabels.length; i++) {
    if (rightLabels[i][0] - rightLabels[i - 1][0] < 13) rightLabels[i][0] = rightLabels[i - 1][0] + 13;
  }
  for (const [y, c, lab] of rightLabels) {
    if (y < M.t + 8 || y > H - M.b - 2) continue;
    s += '<text x="' + (W - M.r + 8) + '" y="' + (y + 3.5) + '" fill="' + c + '" font-size="10.5" font-weight="600">' + lab + '</text>';
  }
  s += '<line id="' + containerId + '-cross" x1="0" x2="0" y1="' + M.t + '" y2="' + (H - M.b) + '" stroke="#3b5068" visibility="hidden"/>';
  s += '</svg><div class="tip"></div>';
  el.innerHTML = s;
  // 悬停十字线+提示
  const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), cross = el.querySelector('#' + containerId + '-cross');
  svg.addEventListener('mousemove', e => {
    const r = svg.getBoundingClientRect();
    const vx = (e.clientX - r.left) * (W / r.width);
    if (vx < M.l || vx > W - M.r) { tip.style.display = 'none'; cross.setAttribute('visibility', 'hidden'); return; }
    const tv = t0 + (vx - M.l) / (W - M.l - M.r) * (t1 - t0);
    let best = 0, bd = 1e18;
    for (let i = 0; i < dd.length; i++) { const d = Math.abs(t(dd[i][0]) - tv); if (d < bd) { bd = d; best = i; } }
    const px = X(t(dd[best][0]));
    cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
    tip.style.display = 'block';
    tip.innerHTML = '<b>' + dd[best][0] + '</b> · ' + yfmt(dd[best][1]) + (best === dd.length - 1 ? ' <span class="mini">(最新)</span>' : '');
    tip.style.left = Math.min(Math.max(e.clientX - r.left + 14, 0), r.width - 150) + 'px';
    tip.style.top = (e.clientY - r.top - 32) + 'px';
  });
  svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; cross.setAttribute('visibility', 'hidden'); });
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
  let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">`;
  for (let i = 0; i <= 4; i++) {
    const v = ymin + (ymax - ymin) * i / 4, y = Y(v);
    s += `<line x1="${M.l}" y1="${y}" x2="${W - M.r}" y2="${y}" stroke="#1c2736"/>`
      + `<text x="${M.l - 7}" y="${y + 4}" fill="#8b96a8" font-size="11" text-anchor="end">${yfmt(v)}</text>`;
  }
  const pts = o.series[0].points;
  for (let i = 0; i < 7; i++) {
    const idx = Math.floor(i * (pts.length - 1) / 6);
    s += `<text x="${X(t(pts[idx][0]))}" y="${H - 7}" fill="#8b96a8" font-size="10.5" text-anchor="middle">${pts[idx][0].slice(2, 7)}</text>`;
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
  // 悬停
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
