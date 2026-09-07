// UI 组件:弹窗/通知/交易表单/通用小部件
import { store } from './store.js';
import { ledger } from './ledger.js';
import { fmt, todayStr } from './config.js';

// ---------- 弹窗 ----------
export function modal({ title, body, onMount }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="overlay"><div class="modal">
    <h3>${title}<span class="x" id="md-close">✕</span></h3>${body}</div></div>`;
  const overlay = root.querySelector('.overlay');
  const close = () => { root.innerHTML = ''; };
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  root.querySelector('#md-close').onclick = close;
  if (onMount) onMount(root, close);
  return close;
}

// ---------- 通知 ----------
export function toast(msg, type = 'ok') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'err' ? ' err' : '');
  el.innerHTML = (type === 'err' ? '⚠️ ' : '✓ ') + msg;
  root.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, 2400);
}

// ---------- 交易弹窗 ----------
export function openTradeModal(pre = {}) {
  const p = Object.assign({ date: todayStr(), etf: 'games', act: '买入', price: '', shares: '', fee: 0, note: '' }, pre);
  modal({
    title: '记一笔交易',
    body: `<div class="frow"><label>日期</label><input type="date" id="tm-date" value="${p.date}" style="width:150px"></div>
      <div class="frow"><label>标的</label>
        <select id="tm-etf" style="flex:1">
          <option value="games" ${p.etf === 'games' ? 'selected' : ''}>游戏(进攻仓)</option>
          <option value="dividend" ${p.etf === 'dividend' ? 'selected' : ''}>红利(压舱仓)</option>
        </select></div>
      <div class="frow"><label>动作</label>
        <select id="tm-act" style="flex:1">
          <option ${p.act === '买入' ? 'selected' : ''}>买入</option>
          <option ${p.act === '卖出' ? 'selected' : ''}>卖出</option>
          <option ${p.act === '分红' ? 'selected' : ''}>分红</option>
          <option ${p.act === '入金' ? 'selected' : ''}>入金</option>
        </select></div>
      <div class="frow"><label>价格(每股,分红=每股派息)</label><input type="number" id="tm-price" step="any" value="${p.price}" placeholder="0.000"></div>
      <div class="frow"><label>股数(入金填金额)</label><input type="number" id="tm-shares" step="100" value="${p.shares}" placeholder="100的整数倍"></div>
      <div class="frow"><label>费用</label><input type="number" id="tm-fee" step="any" value="${p.fee}" style="width:100px"></div>
      <div class="frow"><label>备注</label><input id="tm-note" value="${p.note}" placeholder="可选" style="flex:1"></div>
      <div class="btns"><button class="ghost" onclick="document.getElementById('modal-root').innerHTML=''">取消</button>
      <button id="tm-ok">确认入账</button></div>`,
    onMount: (root, close) => {
      root.querySelector('#tm-ok').onclick = async () => {
        const act = root.querySelector('#tm-act').value;
        let r = {
          date: root.querySelector('#tm-date').value || todayStr(),
          etf: root.querySelector('#tm-etf').value,
          act,
          price: parseFloat(root.querySelector('#tm-price').value) || 0,
          shares: Math.round(parseFloat(root.querySelector('#tm-shares').value) || 0),
          fee: parseFloat(root.querySelector('#tm-fee').value) || 0,
          note: root.querySelector('#tm-note').value || '',
        };
        if (!(r.shares > 0)) { toast('请填股数/金额', 'err'); return; }
        if (act === '买入' && r.price <= 0) { toast('买入需要价格', 'err'); return; }
        if (act === '入金') { r.etf = 'cash'; r.price = 0; }
        try {
          await ledger.add(r);
          store.set({ ledger: ledger.rows });
          close();
          toast('已入账 · 持仓与成本已更新');
        } catch (e) { toast('保存失败: ' + e.message, 'err'); }
      };
    },
  });
}

// ---------- 动作行 ----------
export function actRow(o) {
  const chk = o.static ? '' :
    `<input type="checkbox" ${o.done ? 'checked' : ''} onchange="toggleDone('${o.id}')">`;
  const rec = o.rec ? `<button class="sm ghost" onclick="openTradeModal({etf:'${o.rec.etf}',act:'${o.rec.act}',price:${o.rec.price},shares:${o.rec.shares},note:'${o.rec.note || ''}'});window.__afterTrade('${o.id}')">记账</button>` : '';
  return `<div class="act ${o.done ? 'done ' : ''}${o.hot ? 'hot ' : ''}${o.warn ? 'warn' : ''}">
    ${chk}<span class="tag">${o.label}</span>
    <span class="lvl">${o.lvl}</span><span class="mini">${o.sub || ''}</span>
    ${rec}<span class="dist">${o.dist || ''}</span></div>`;
}

export function sigmaGauge(pos) {
  const lo = -2.5, hi = 1.5, x = Math.max(lo, Math.min(hi, pos));
  return `<div class="gauge"><div class="mark" style="left:${((x - lo) / (hi - lo) * 100)}%"></div></div>
  <div class="gauge-labels"><span>-2.5σ</span><span>-1σ</span><span>中轨</span><span>+1σ</span><span class="flat"><b>${pos.toFixed(2)}σ</b> 现在</span></div>`;
}

// ---------- 快捷操作(全局) ----------
window.toggleDone = id => {
  const s = store.state;
  const done = Object.assign({}, s.done);
  done[id] = !done[id];
  localStorage.setItem('sa_done_v1', JSON.stringify(done));
  store.set({ done });
};
window.openTradeModal = openTradeModal;
// 从决策卡记账后自动勾选done:由视图注册
window.__afterTrade = id => {
  if (!id) return;
  const done = Object.assign({}, store.state.done, { [id]: true });
  localStorage.setItem('sa_done_v1', JSON.stringify(done));
  store.set({ done });
};
