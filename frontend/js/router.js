// hash路由:#/dashboard #/positions #/quant #/settings
export const VIEWS = ['dashboard', 'positions', 'quant', 'settings'];
export function currentView() {
  const h = location.hash.replace('#/', '');
  return VIEWS.includes(h) ? h : 'dashboard';
}
export function initViewSwitching(onChange) {
  window.addEventListener('hashchange', () => onChange(currentView()));
}
