// 后端API访问层
async function req(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) {
    let msg = r.status + '';
    try { msg = (await r.json()).detail || msg; } catch (e) { /* ignore */ }
    throw new Error(msg);
  }
  return r.json();
}
export const api = {
  quotes: () => req('/api/quotes'),
  intraday: key => req(`/api/intraday?sym=${key}`),
  data: () => req('/api/data'),
  stats: () => req('/api/stats'),
  statsRefresh: () => req('/api/stats?refresh=1'),   // 强制重抓K线+重算回测
  ledger: () => req('/api/ledger'),
  saveLedger: rows => req('/api/ledger', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  }),
  seedDemo: () => req('/api/ledger/demo', { method: 'POST' }),
  saveRules: rules => req('/api/rules', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules }),
  }),
  resetRules: () => req('/api/rules', { method: 'DELETE' }),
};
