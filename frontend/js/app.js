// 主入口:加载 → store → 路由 → 视图渲染 → 行情轮询
import { api } from './api.js';
import { store } from './store.js';
import { ledger, calc } from './ledger.js';
import { curChannel } from './channel.js';
import { currentView, initViewSwitching } from './router.js';
import { renderDashboard } from './views/dashboard.js';
import { renderPositions } from './views/positions.js';
import { renderQuant } from './views/quant.js';
import { renderSettings } from './views/settings.js';
import { POLL_MS, fmt } from './config.js';

const $ = id => document.getElementById(id);
const POLL = POLL_MS;

// ------------------------------------------------------------------
// 派生量(每次store变化时重算):通道/持仓统计/关键价
// ------------------------------------------------------------------
function derive(state) {
  if (!state.D) return;
  const D = state.D;
  const lastD = k => D[k].daily[D[k].daily.length - 1][1];
  const g = state.liveOk ? state.live.games.price : lastD('games');
  const h = state.liveOk ? state.live.dividend.price : lastD('dividend');
  const s = state.liveOk ? state.live.sse.price : lastD('sse');
  const L = calc(state.ledger);
  const chD = curChannel('dividend', h, D.dividend.monthlies, D.ratio);
  const chG = curChannel('games', g, D.games.monthlies, 1);
  const d = D.sse.daily.map(r => r[1]); d.push(s);
  store.state.h = h; store.state.g = g; store.state.s = s;
  store.state.L = L; store.state.chD = chD; store.state.chG = chG;
  store.state.ma20 = d.length < 20 ? s : d.slice(-20).reduce((a, b) => a + b, 0) / 20;
}

// ------------------------------------------------------------------
// 渲染
// ------------------------------------------------------------------
const VIEW_RENDER = {
  dashboard: renderDashboard,
  positions: renderPositions,
  quant: renderQuant,
  settings: renderSettings,
};

function renderChrome() {
  const st = store.state;
  const t = st.liveOk && st.live.games ? st.live.games.time : null;
  let txt = '离线(数据快照)', cls = 'badge off';
  if (t) {
    const hh = +t.slice(8, 10), mm = +t.slice(10, 12);
    const wd = new Date(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8)).getDay();
    const trad = wd >= 1 && wd <= 5 && ((hh === 9 && mm >= 30) || (hh === 10) || (hh === 11 && mm <= 30) || (hh === 13) || (hh === 14));
    txt = trad ? '交易中' : '已收盘'; cls = trad ? 'badge live' : 'badge';
  }
  $('mkt').textContent = txt; $('mkt').className = cls;
  $('upt').textContent = (st.liveOk ? '实时行情 · ' : '') + '回测与历史 ' + (st.D ? st.D.updated : '');
  document.querySelectorAll('#tabs a').forEach(a =>
    a.classList.toggle('on', a.dataset.view === st.view));
}

function renderView(animate = false) {
  const view = document.getElementById('view');
  if (animate) { view.classList.remove('anim'); void view.offsetWidth; view.classList.add('anim'); }
  derive(store.state);
  const fn = VIEW_RENDER[store.state.view] || renderDashboard;
  fn(view);
  renderFooter();
}

function renderFooter() {
  const st = store.state;
  if (!st.D) return;
  const s = st.D.stats.system;
  $('ft').innerHTML =
    `数据源:腾讯行情(实时+复权K线) · 通道=月线36月滚动OLS(log价)+±1σ残差带 · 压舱仓通道用后复权,进攻仓用前复权<br>
    流水账=本机SQLite · 历史与回测:${st.D.updated} · 实时价每${POLL / 1000}秒轮询<br>
    口径与局限:系统胜率${(s.win * 100).toFixed(0)}%为${s.n}锚点样本内数字(CI ${(s.ci[0] * 100).toFixed(0)}~${(s.ci[1] * 100).toFixed(0)}%)·样本=一轮熊市·止损假设板块与指数破位同步。<b>本工具仅为个人研究用途,不构成投资建议。</b>`;
}

// ------------------------------------------------------------------
// 行情轮询
// ------------------------------------------------------------------
let refreshing = false;
async function refresh(silent = true) {
  if (!store.state.D) return;
  try {
    const live = await api.quotes();
    store.set({ live, liveOk: true });
  } catch (e) {
    if (!silent) alert('行情获取失败: ' + e.message);
    store.set({ liveOk: false });
  }
}
window.refreshNow = () => refresh(false);

// ------------------------------------------------------------------
// 启动
// ------------------------------------------------------------------
(async function main() {
  try {
    const D = await api.data();
    await ledger.load();
    store.set({
      D, ledger: ledger.rows,
      done: JSON.parse(localStorage.getItem('sa_done_v1') || '{}'),
      p: +(localStorage.getItem('sa_p_repair') || 58),
      view: currentView(),
    });
  } catch (e) {
    $('loading').innerHTML = `<div style="color:#f87171;font-size:14px">加载失败: ${e.message}<br><br>请确认后端服务已启动(./run.sh),且能访问行情接口。</div>`;
    return;
  }
  $('loading').style.display = 'none';
  $('app').style.display = 'block';
  derive(store.state);
  renderChrome();
  renderView(true);
  // store订阅:任何变化→重渲染当前视图
  store.sub(() => { renderChrome(); renderView(); });
  // 视图切换
  initViewSwitching(v => { store.set({ view: v }); renderView(true); window.scrollTo(0, 0); });
  // 首次行情 + 轮询
  await refresh();
  setInterval(refresh, POLL);
})();
