// 量化分析:三块面板——系统层(历史成绩)/资产层(当前位置)/加仓与追涨
import { store } from '../store.js';
import { fmt, ZONE_CUTS } from '../config.js';

function zoneOf(pos, key, D) {
  const cuts = ZONE_CUTS[key];
  const table = key === 'dividend' ? D.stats.dividend_zones : D.stats.games_zones;
  return table[cuts.reduce((a, c) => a + (pos > c ? 1 : 0), 0)];
}
const zoneCls = pos => (pos <= -1 ? 'deep' : pos < 0 ? 'mid' : 'high');
const zoneLbl = pos => (pos <= -1 ? '深区' : pos < 0 ? '中位区' : '高位区');

function zoneList(rows, cur) {
  return `<div class="zonelist">${rows.map(z => `
    <div class="zrow ${z === cur ? 'on' : ''}">
      <span class="zname">${z[0]}</span>
      <span class="right">
        <span><b class="up">${((z[1] || 0) * 100).toFixed(0)}%</b> 胜率</span>
        <span><b>${fmt.pct((z[2] || 0) * 100, 1)}</b> 平均</span>
        <span><b>${z[3]}</b> n</span>
      </span></div>`).join('')}</div>`;
}

function posCard(key, name, ch, zone, price, extras) {
  const dist = (x, p) => `${fmt.p(x)} · <span class="${(x / p - 1) >= 0 ? 'up' : 'down'}">${(x / p - 1) >= 0 ? '+' : ''}${((x / p - 1) * 100).toFixed(1)}%</span>`;
  return `<div class="poscard">
    <div class="h"><span class="n">${name}</span>
      <span class="tag2 ${zoneCls(ch.pos)}">${zoneLbl(ch.pos)} · ${ch.pos.toFixed(2)}σ</span></div>
    <div class="main">
      <span class="sigma">${ch.pos.toFixed(2)}σ</span>
      <div>
        <div class="zname">当前分区: ${zone[0]}</div>
        <div class="mini">中轨 ${fmt.p(ch.mid)} · 残差σ ${ch.sd.toFixed(4)}</div>
      </div></div>
    <div class="gauge"><div class="mark" style="left:${Math.max(0, Math.min(100, (ch.pos + 3) / 4.5 * 100))}%"></div></div>
    <div class="statline">
      <span>12月胜率<b class="up">${((zone[1] || 0) * 100).toFixed(0)}%</b></span>
      <span>平均<b class="${(zone[2] || 0) >= 0 ? 'up' : 'down'}">${fmt.pct((zone[2] || 0) * 100, 1)}</b></span>
      <span>样本<b>${zone[3]}</b></span>
      <span style="margin-left:auto">现价<b style="font-size:15px">${price.toFixed(3)}</b></span>
    </div>
    <div class="edges">
      ${extras.map(e => `<span class="e"><b>${e.l}</b> ${dist(e.p, price)}</span>`).join('')}
    </div></div>`;
}

export function renderQuant(root) {
  const s = store.state, D = s.D;
  const st = D.stats.system, ge = D.stats.games_events, ce = D.stats.chase_events;
  const h = s.h, g = s.g;
  const L = s.L;
  const dVal = L.dividend.sh * h, gVal = L.games.sh * g;
  const tot = dVal + gVal + L.cash;
  const cD = s.chD.last, cG = s.chG.last;
  const P = s.p;
  const rg = D.rules.games;
  const zD = zoneOf(cD.pos, 'dividend', D), zG = zoneOf(cG.pos, 'games', D);
  const evDyn = tot > 0 && zD ? (dVal / tot) * (zD[2] || 0) + (gVal / tot) * (ge.escheme_avg || 0) + (L.cash / tot) * 0.015 : 0;
  const tp1 = (L.games.cost || 0) * rg.tp1_mult;
  const flags = [
    ['上证>证伪线', s.s > rg.sse_stop],
    ['上证>MA20', s.s > s.ma20],
    ['进攻仓>-1σ', cG.pos > -1],
    ['压舱仓>-0.4σ', cD.pos > -0.4],
  ];
  const nOk = flags.filter(f => f[1]).length;
  const pSug = nOk >= 3 ? 65 : nOk === 2 ? 55 : nOk === 1 ? 45 : 35;
  const ev = st.mid + (st.late - st.mid) * P / 100;
  const mt = D.stats.mode_table;
  const modeRows = mt.map((m, i) => `<tr${i === mt.length - 1 ? ' style="background:#0a996909"' : ''}>
    <td>${m[0]}</td><td>${((m[1] || 0) * 100).toFixed(0)}%</td>
    <td class="up">${fmt.pct((m[2] || 0) * 100, 1)}</td>
    <td class="${(m[3] || 0) < 0 ? 'down' : 'flat'}">${fmt.pct((m[3] || 0) * 100, 1)}</td></tr>`).join('');

  root.innerHTML = `
  <!-- 面板1:系统层 -->
  <div class="panel">
    <h2 style="display:flex;justify-content:space-between;align-items:baseline"><span>系统层 · 这套规则的历史成绩</span>
      <span class="mini">${st.n}个锚点 · 样本内一轮熊市</span></h2>
    <div class="statrow">
      <div class="qcard" style="cursor:default"><div class="qmeta">系统胜率</div>
        <div class="qrow"><span class="qprice">${(st.win * 100).toFixed(0)}<span style="font-size:13px">%</span></span></div>
        <div class="mini">95%CI [${(st.ci[0] * 100).toFixed(0)}~${(st.ci[1] * 100).toFixed(0)}%]</div></div>
      <div class="qcard" style="cursor:default"><div class="qmeta">12月平均收益</div>
        <div class="qrow"><span class="qprice ${st.avg >= 0 ? 'up' : 'down'}">${fmt.pct(st.avg * 100, 1)}</span></div>
        <div class="mini">规则化持有 · 不是预测</div></div>
      <div class="qcard" style="cursor:default"><div class="qmeta">最差锚点</div>
        <div class="qrow"><span class="qprice ${st.worst >= 0 ? 'up' : 'down'}">${fmt.pct(st.worst * 100, 1)}</span></div>
        <div class="mini">历史上最坏一次</div></div>
      <div class="qcard" style="cursor:default"><div class="qmeta">中段重演(磨底)</div>
        <div class="qrow"><span class="qprice ${st.mid >= 0 ? 'up' : 'down'}">${fmt.pct(st.mid * 100, 1)}</span></div>
        <div class="mini">熊市继续情境</div></div>
      <div class="qcard" style="cursor:default"><div class="qmeta">修复兑现(剧本成功)</div>
        <div class="qrow"><span class="qprice ${st.late >= 0 ? 'up' : 'down'}">${fmt.pct(st.late * 100, 1)}</span></div>
        <div class="mini">趋势回归情境</div></div>
    </div>
    <div class="grid2" style="margin-top:2px">
      <div>
        <div class="lbl">情境模拟 · P(修复)自检 <span class="mini">EV = 中段 ${fmt.pct(st.mid * 100, 1)} × P(中段) + 尾段 ${fmt.pct(st.late * 100, 1)} × P(修复)</span></div>
        <div style="display:flex;align-items:center;gap:12px;margin:8px 0">
          <span class="mini" style="white-space:nowrap">P(修复)</span>
          <input type="range" min="0" max="100" value="${P}" style="flex:1" oninput="setP(+this.value)">
          <b style="width:48px;font-family:var(--mono)">${P}%</b>
          <span style="font-size:14px">EV ≈ <b class="${ev >= 0 ? 'up' : 'down'}">${fmt.pct(ev * 100, 1)}</b></span>
        </div>
        <div class="mini">P=50%时EV仍约+${((st.mid + (st.late - st.mid) * 0.5) * 100).toFixed(1)}% —— 系统不把运气当前提</div>
      </div>
      <div>
        <div class="lbl">行情温度(启发式·非预测)</div>
        <div style="display:flex;gap:7px;flex-wrap:wrap;margin:8px 0 4px">
          ${flags.map(f => `<span class="flag ${f[1] ? 'ok' : 'no'}">${f[1] ? '✓' : '✗'} ${f[0]}</span>`).join('')}
        </div>
        <div class="mini">${nOk}/4 修复迹象 → 建议 P(修复)≈${pSug}%
          <button class="sm ghost" onclick="setP(${pSug})" style="margin-left:6px">应用</button></div>
      </div>
    </div>
  </div>

  <!-- 面板2:资产层 -->
  <div class="panel">
    <h2>资产层 · 你现在的仓位 <span class="mini">(随行情实时更新的σ位置 → 对应历史分区的胜率)</span></h2>
    <div class="grid2eq">
      ${posCard('dividend', D.symbols.dividend.name + ' · 压舱仓', cD, zD, h, [
        { l: '加仓① -1.5σ', p: cD.l15 }, { l: '加仓② -2σ', p: cD.l2 }, { l: '减仓 +1σ', p: cD.u1 }])}
      ${posCard('games', D.symbols.games.name + ' · 进攻仓', cG, zG, g, [
        { l: '回踩加仓', p: rg.adds[0].price }, { l: '追涨档', p: rg.adds[1].price },
        { l: '止盈①', p: tp1 }, { l: '+1σ 终点', p: cG.u1 }])}
    </div>
    ${tot > 0 ? `<div class="evbar">
      <span class="t">组合期望(动态加权)</span>
      <span>压舱 ${(dVal / tot * 100).toFixed(0)}% × ${fmt.pct((zD ? zD[2] : 0) * 100, 1)}</span>
      <span>+ 进攻 ${(gVal / tot * 100).toFixed(0)}% × ${fmt.pct((ge.escheme_avg || 0) * 100, 1)}</span>
      <span>+ 现金 ${(L.cash / tot * 100).toFixed(0)}% × 1.5%</span>
      <span class="v">≈ <b class="${evDyn >= 0 ? 'up' : 'down'}">${fmt.pct(evDyn * 100, 1)}</b> · <b>${evDyn * tot >= 0 ? '+' : ''}${(evDyn * tot).toFixed(0)}元</b></span>
    </div>` : ''}
    <div class="mini" style="margin-top:8px">注:各资产胜率不独立(同涨同跌),组合胜率以系统层${(st.win * 100).toFixed(0)}%为准;EV为线性近似,偏乐观。${st.note}</div>
    <div class="grid2eq" style="margin-top:12px">
      <div>
        <div class="lbl">压舱仓分区胜率</div>
        ${zoneList(D.stats.dividend_zones, zD)}
      </div>
      <div>
        <div class="lbl">进攻仓分区胜率 <span class="mini">${D.stats.games_zones_note}</span></div>
        ${zoneList(D.stats.games_zones, zG)}
      </div>
    </div>
  </div>

  <!-- 面板3:加仓与追涨 -->
  <div class="panel">
    <h2>加仓方式与追涨 <span class="mini">(同一系统 · ${st.n}锚点)</span></h2>
    <div class="grid2eq">
      <div>
        <div class="lbl">五种加仓方式对比</div>
        <table><tr><th>方式</th><th>胜率</th><th>平均</th><th>最差</th></tr>${modeRows}</table>
        <div class="mini">${D.stats.mode_note}</div>
      </div>
      <div>
        <div class="lbl">低区突破追涨 · 事件检验 <span class="mini">(n=${ce.n} · 极小样本)</span></div>
        <div class="minicards">
          <div class="minicard"><div class="k">12月胜率</div><div class="v up">${((ce.win || 0) * 100).toFixed(0)}%</div></div>
          <div class="minicard"><div class="k">平均收益</div><div class="v up">${fmt.pct((ce.avg || 0) * 100, 1)}</div></div>
          <div class="minicard"><div class="k">回撤中位</div><div class="v down">${((ce.dip_med || 0) * 100).toFixed(0)}%</div></div>
        </div>
        <div class="mini">${ce.fail_n}次曾跌回突破价下方,最终仍${((ce.fail_win || 0) * 100).toFixed(0)}%胜 · 最深回撤${((ce.dip_worst || 0) * 100).toFixed(0)}%</div>
        <details><summary>结论:可以追,但"确认后追" —— 展开看4条</summary>
          <div class="mini">① 追涨比死等回踩期望更高,胜率不变——不降低系统质量;<br>
          ② 两段式:回踩档 + 周收盘确认后追涨档,孰先到孰成交;<br>
          ③ 不追"中间态"——既无折价也无确认;<br>
          ④ 追进去要做好坐${((ce.dip_med || 0) * 100).toFixed(0)}%回撤的觉悟,止损只认指数证伪线。</div>
        </details>
      </div>
    </div>
    <div class="mini" style="margin-top:10px">${ge.note} 历史统计不构成投资建议。</div>
  </div>`;
}
window.setP = v => { store.set({ p: v }); localStorage.setItem('sa_p_repair', v); };