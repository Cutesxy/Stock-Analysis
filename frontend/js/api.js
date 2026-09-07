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
  data: () => req('/api/data'),
  stats: () => req('/api/stats'),
  ledger: () => req('/api/ledger'),
  saveLedger: rows => req('/api/ledger', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  }),
  seedDemo: () => req('/api/ledger/demo', { method: 'POST' }),
};
