// 量化分析视图:胜率三层 + 分区表 + 方案对比 + 追涨检验
import { store } from '../store.js';
import { fmt, ZONE_CUTS } from '../config.js';

export function renderQuant(root) {
  const s = store.state;
  const D = s.D, L = s.L;
  const st = D.stats.system, ge = D.stats.games_events, ce = D.stats.chase_events;
  const h = s.h, g = s.g;
  const dVal = L.dividend.sh * h, gVal = L.games.sh * g;
  const tot = dVal + gVal + L.cash;
  const cD = s.chD.last, cG = s.chG.last;
  const P = s.p;

  const zoneOf = (pos, key) => {
    const cuts = ZONE_CUTS[key];
    const table = key === 'dividend' ? D.stats.dividend_zones : D.stats.games_zones;
    return table[cuts.reduce((a, c) => a + (pos > c ? 1 : 0), 0)];
  };
  const zD = zoneOf(cD.pos, 'dividend');
  const evDyn = tot > 0 && zD ? (dVal / tot) * (zD[2] || 0) + (gVal / tot) * (ge.escheme_avg || 0) + (L.cash / tot) * 0.015 : 0;

  const flags = [
    ['上证>证伪线', s.s > D.rules.games.sse_stop],
    ['上证>MA20', s.s > s.ma20],
    ['进攻仓>-1σ', cG.pos > -1],
    ['压舱仓>-0.4σ', cD.pos > -0.4],
  ];
  const nOk = flags.filter(f => f[1]).length;
  const pSug = nOk >= 3 ? 65 : nOk === 2 ? 55 : nOk === 1 ? 45 : 35;
  const ev = st.mid + (st.late - st.mid) * P / 100;

  const zones = D.stats.dividend_zones.map(z =>
    `<tr${z === zD ? ' style="background:#4c7dff1f"' : ''}><td>${z[0]}</td><td>${((z[1] || 0) * 100).toFixed(0)}%</td><td>${fmt.pct((z[2] || 0) * 100, 1)}</td><td>${z[3]}</td></tr>`).join('');
  const gz = D.stats.games_zones.map(z =>
    `<tr><td>${z[0]}</td><td>${((z[1] || 0) * 100).toFixed(0)}%</td><td>${fmt.pct((z[2] || 0) * 100, 1)}</td><td>${z[3]}</td></tr>`).join('');
  const modeRows = D.stats.mode_table;
  const mt = modeRows.map((m, i) =>
    `<tr${i === modeRows.length - 1 ? ' style="background:#2ebd8514"' : ''}><td>${m[0]}</td><td>${((m[1] || 0) * 100).toFixed(0)}%</td>
    <td class="up">${fmt.pct((m[2] || 0) * 100, 1)}</td><td class="${(m[3] || 0) < 0 ? 'down' : 'flat'}">${fmt.pct((m[3] || 0) * 100, 1)}</td></tr>`).join('');

  root.innerHTML = `
  <div class="statrow">
    <div class="qcard" style="cursor:default"><div class="qmeta">系统胜率 · ${st.n}锚点</div>
      <div class="qrow"><span class="qprice">${(st.win * 100).toFixed(0)}<span style="font-size:13px">%</span></span></div>
      <div class="mini">95%CI [${(st.ci[0] * 100).toFixed(0)}~${(st.ci[1] * 100).toFixed(0)}%]</div></div>
    <div class="qcard" style="cursor:default"><div class="qmeta">12月平均收益</div>
      <div class="qrow"><span class="qprice ${st.avg >= 0 ? 'up' : 'down'}">${fmt.pct(st.avg * 100, 1)}</span></div>
      <div class="mini">规则化持有·不择时预测</div></div>
    <div class="qcard" style="cursor:default"><div class="qmeta">最差锚点</div>
      <div class="qrow"><span class="qprice ${st.worst >= 0 ? 'up' : 'down'}">${fmt.pct(st.worst * 100, 1)}</span></div>
      <div class="mini">历史上最坏一次</div></div>
    <div class="qcard" style="cursor:default"><div class="qmeta">中段重演</div>
      <div class="qrow"><span class="qprice ${st.mid >= 0 ? 'up' : 'down'}">${fmt.pct(st.mid * 100, 1)}</span></div>
      <div class="mini">熊市继续磨底情境</div></div>
    <div class="qcard" style="cursor:default"><div class="qmeta">修复兑现</div>
      <div class="qrow"><span class="qprice ${st.late >= 0 ? 'up' : 'down'}">${fmt.pct(st.late * 100, 1)}</span></div>
      <div class="mini">剧本兑现情境</div></div>
  </div>
  <div class="panel"><h2>资产层与情境模拟 <span class="mini">(不构成投资建议)</span></h2>

  <div class="grid2"><div>
    <div class="lbl">资产层 · 随行情实时查表</div>
    ${zD ? `<div class="zone"><span class="zname">压舱仓 ${cD.pos.toFixed(2)}σ</span>
      <span class="mini">${zD[0]} →</span><b class="up">${((zD[1] || 0) * 100).toFixed(0)}%</b>
      <span class="mini">平均${fmt.pct((zD[2] || 0) * 100, 1)} (n=${zD[3]})</span></div>` : ''}
    <div class="zone"><span class="zname">进攻仓 ${cG.pos.toFixed(2)}σ</span>
      <span class="mini">入场结构${ge.n}事件 →</span><b class="up">${((ge.escheme_win || 0) * 100).toFixed(0)}%</b>
      <span class="mini">平均${fmt.pct((ge.escheme_avg || 0) * 100, 1)}(E方案)</span></div>
    ${tot > 0 ? `<div class="lbl">组合期望(动态加权)</div>
      <div>EV ≈ 压舱${(dVal / tot * 100).toFixed(0)}%×${fmt.pct((zD ? zD[2] : 0) * 100, 1)} + 进攻${(gVal / tot * 100).toFixed(0)}%×${fmt.pct((ge.escheme_avg || 0) * 100, 1)} + 现金${(L.cash / tot * 100).toFixed(0)}%×1.5%
      = <b class="${evDyn >= 0 ? 'up' : 'down'}">${fmt.pct(evDyn * 100, 1)}</b> ≈ <b>${evDyn * tot >= 0 ? '+' : ''}${(evDyn * tot).toFixed(0)}元</b></div>
      <div class="mini" style="margin-top:3px">注:各资产胜率不独立,组合胜率以系统层${(st.win * 100).toFixed(0)}%为准;EV为线性近似,偏乐观</div>` : ''}
    <div class="lbl">行情温度(启发式·非预测)</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px">
      ${flags.map(f => `<span class="flag ${f[1] ? 'ok' : 'no'}">${f[1] ? '✓' : '✗'} ${f[0]}</span>`).join('')}</div>
    <div class="mini">${nOk}/4 修复迹象 → 建议 P(修复)≈${pSug}% <button class="sm ghost" onclick="setP(${pSug})">应用到滑块</button></div>

    <div class="lbl">分区胜率 · 压舱仓(月线通道)</div>
    <table><tr><th>σ区间</th><th>12月胜率</th><th>平均</th><th>n</th></tr>${zones}</table>
    <div class="lbl">分区胜率 · 进攻仓 <span class="mini">${D.stats.games_zones_note}</span></div>
    <table><tr><th>σ区间</th><th>胜率</th><th>平均</th><th>n</th></tr>${gz}</table>
  </div><div>
    <div class="lbl">情境模拟(拖动自检)</div>
    <div class="mini">EV = 中段 ${fmt.pct(st.mid * 100, 1)} × P(中段重演) + 尾段 ${fmt.pct(st.late * 100, 1)} × P(修复)</div>
    <div style="display:flex;align-items:center;gap:10px;margin:8px 0">
      <span class="mini" style="white-space:nowrap">P(修复)</span>
      <input type="range" min="0" max="100" value="${P}" style="flex:1" oninput="setP(+this.value)">
      <b style="width:46px">${P}%</b></div>
    <div>P=${P}%时组合期望 <b class="${ev >= 0 ? 'up' : 'down'}">${fmt.pct(ev * 100, 1)}</b>${tot > 0 ? ` ≈ <b>${ev * tot >= 0 ? '+' : ''}${(ev * tot).toFixed(0)}元</b>(按总资产${fmt.money(tot)})` : ''}</div>
    <div class="mini" style="margin-top:4px">胜率来自规则(止损锚指数+阶梯止盈+两段加仓),不来自预测;P=50%时EV仍约+${((st.mid + (st.late - st.mid) * 0.5) * 100).toFixed(1)}%——系统不把运气当前提</div>

    <div class="lbl">加仓方式对比(同一系统·${st.n}锚点)</div>
    <table><tr><th>方式</th><th>胜率</th><th>平均</th><th>最差</th></tr>${mt}</table>
    <div class="mini">${D.stats.mode_note}</div>
  </div></div>
  <div class="mini" style="margin-top:6px">${st.note}。${ge.note}。历史统计不构成投资建议。</div></div>

  <div class="panel"><h2>追涨决策 · 数据检验</h2>
  <div class="grid2eq"><div>
    <div class="mini">进攻标的历史上${ce.n}次"MA250下方创20日新高":12月胜率<b class="up">${((ce.win || 0) * 100).toFixed(0)}%</b>·平均<b class="up">${fmt.pct((ce.avg || 0) * 100, 1)}</b>(n=${ce.n},一轮熊市样本)</div>
    <div class="mini">其中${ce.fail_n}次曾跌回突破价下方——最终仍${((ce.fail_win || 0) * 100).toFixed(0)}%胜:突破失败≠剧本失败(止损只认指数证伪线)</div>
    <div class="mini">但追涨者要坐过山车:12月内中位回踩<b class="down">${((ce.dip_med || 0) * 100).toFixed(0)}%</b>·最深<b class="down">${((ce.dip_worst || 0) * 100).toFixed(0)}%</b></div>
  </div><div>
    <details><summary>结论:可以追,但要"确认后追" —— 展开看4条</summary>
    <div class="mini">① 追涨比死等回踩期望更高,胜率不变——追涨不降低系统质量;<br>
    ② 采用两段式:回踩档 + 周收盘确认后追涨档,孰先到孰成交;<br>
    ③ 不追"中间态"(既没回踩也没突破的位置)——既无折价也无确认;<br>
    ④ 追进去后要有坐${((ce.dip_med || 0) * 100).toFixed(0)}%回撤的觉悟,止损线依然只认指数证伪线。</div></details>
  </div></div></div>`;
}
window.setP = v => { store.set({ p: v }); localStorage.setItem('sa_p_repair', v); };
