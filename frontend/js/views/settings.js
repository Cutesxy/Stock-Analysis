// 设置视图:规则参数编辑(回测实时跟随) + 数据维护 + 关于
import { store } from '../store.js';
import { api } from '../api.js';
import { toast } from '../ui.js';
import { ledger } from '../ledger.js';

export function renderSettings(root) {
  const s = store.state;
  const D = s.D, rg = D.rules.games, rd = D.rules.dividend;
  const f = (id, label, val, step = 'any', unit = '') =>
    `<div class="set-item"><label>${label}${unit ? ' (' + unit + ')' : ''}</label><input type="number" id="${id}" step="${step}" value="${val}"></div>`;
  root.innerHTML = `
  <div class="panel"><h2>规则参数 <span class="mini">(保存后通道位/止盈线/回测胜率全部实时重算)</span></h2>
    <div class="lbl">进攻仓 · 加仓与止盈</div>
    <div class="set-grid">
      ${f('g_add_price', '回踩加仓价', rg.adds[0].price, '0.001', '元')}
      ${f('g_add_shares', '回踩加仓股数', rg.adds[0].shares, '100', '股')}
      ${f('g_break_price', '突破追涨价(周收盘确认)', rg.adds[1].price, '0.001', '元')}
      ${f('g_break_shares', '突破追涨股数', rg.adds[1].shares, '100', '股')}
      ${f('g_tp1', '止盈①倍率', rg.tp1_mult, '0.001', '×成本')}
      ${f('g_tp2', '止盈②倍率', rg.tp2_mult, '0.001', '×成本')}
      ${f('g_stop', '上证证伪线', rg.sse_stop, '1', '点')}
      ${f('g_old', '前低参考', rg.old_stop, '0.001', '元')}
    </div>
    <div class="lbl">进攻仓 · 到期日</div>
    <div class="set-grid"><div class="set-item"><label>到期评估日</label><input type="date" id="g_expiry" value="${rg.expiry}"></div></div>
    <div class="lbl">压舱仓 · 加仓阶梯</div>
    <div class="set-grid">
      ${f('d_add1_shares', '加仓①股数(-1.5σ)', rd.adds[0].shares, '100', '股')}
      ${f('d_add2_shares', '加仓②股数(-2σ)', rd.adds[1].shares, '100', '股')}
      ${f('d_trim', '减仓σ位', rd.trim_sig, '0.1', 'σ')}
    </div>
    <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
      <button id="rules-save">保存规则</button>
      <button class="ghost" id="rules-reset">恢复默认</button>
      <span class="mini" id="rules-msg" style="align-self:center"></span></div>
  </div>

  <div class="panel"><h2>数据维护</h2>
    <div class="big">
      <div class="kv"><div class="k">历史数据截至</div><div class="v" style="font-size:15px">${D.updated}</div></div>
      <div class="kv"><div class="k">实时行情</div><div class="v" style="font-size:15px">${s.liveOk ? '在线·' + (POLL / 1000) + '秒轮询' : '离线快照'}</div></div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button id="btn-refetch">⟳ 重新抓取历史并重算回测(约10秒)</button>
      <button class="ghost" id="btn-demo">载入演示流水</button>
    </div>
    <div class="mini" style="margin-top:8px">K线缓存有效期12小时(改规则不需要重新抓取,只有新交易日才需要)</div>
  </div>

  <div class="panel"><h2>关于</h2>
    <div class="mini" style="line-height:1.9">
      双ETF作战系统 v2.0 · MIT开源 · <a href="https://github.com/Cutesxy/Stock-Analysis" target="_blank" style="color:#60a5fa">github.com/Cutesxy/Stock-Analysis</a><br>
      方法论:月线36月滚动对数通道 + 历史锚点回测 + 规则化交易(详见DEVELOPMENT.md)<br>
      所有胜率数字为样本内历史统计(一轮熊市),95%置信区间见量化分析页。<b>本工具仅为个人研究用途,不构成投资建议。</b><br>
      你的交易流水存于本机SQLite(backend/data/),可随时导出JSON备份;本仓库不收集任何数据。</div>
  </div>`;

  const num = id => parseFloat(document.getElementById(id).value);
  document.getElementById('rules-save').onclick = async () => {
    const rules = {
      games: {
        adds: [
          { price: num('g_add_price'), shares: num('g_add_shares') },
          { price: num('g_break_price'), shares: num('g_break_shares') },
        ],
        tp1_mult: num('g_tp1'), tp2_mult: num('g_tp2'),
        sse_stop: num('g_stop'), old_stop: num('g_old'),
        expiry: document.getElementById('g_expiry').value,
        breakout: num('g_break_price'),
      },
      dividend: {
        adds: [{ shares: num('d_add1_shares') }, { shares: num('d_add2_shares') }],
        trim_sig: num('d_trim'),
      },
    };
    try {
      const msg = document.getElementById('rules-msg');
      msg.textContent = '保存中…';
      await api.saveRules(rules);
      // 重新拉取数据(用新规则重算的统计)
      const D2 = await api.data();
      store.set({ D: D2, L: undefined });
      toast('规则已保存 · 回测已用新参数重算');
    } catch (e) { toast('保存失败: ' + e.message, 'err'); }
  };
  document.getElementById('rules-reset').onclick = async () => {
    if (!confirm('恢复默认规则?当前的自定义参数将丢弃')) return;
    try {
      await api.resetRules();
      const D2 = await api.data();
      store.set({ D: D2 });
      toast('已恢复默认规则');
    } catch (e) { toast('失败: ' + e.message, 'err'); }
  };
  document.getElementById('btn-refetch').onclick = async () => {
    const btn = document.getElementById('btn-refetch');
    btn.disabled = true; btn.textContent = '抓取中…(约10秒)';
    try {
      await api.statsRefresh();
      const D2 = await api.data();
      store.set({ D: D2 });
      toast('历史数据已更新至最新');
    } catch (e) { toast('更新失败: ' + e.message, 'err'); }
    btn.disabled = false; btn.textContent = '⟳ 重新抓取历史并重算回测(约10秒)';
  };
  document.getElementById('btn-demo').onclick = async () => {
    await api.seedDemo();
    await ledger.load();
    store.set({ ledger: ledger.rows });
    toast('演示流水已载入');
  };
}
const POLL = 30000;
