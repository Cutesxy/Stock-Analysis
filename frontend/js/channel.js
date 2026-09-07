// 通道计算(客户端实时重算):月线36月滚动OLS(log价)+±1σ残差带
// 与后端 channel.py 同一数学口径;前端用实时价替换当月收盘后重算最新一期
export function chan(months, window = 36) {
  const out = [];
  for (let t = window; t < months.length; t++) {
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let j = 0; j < window; j++) {
      const x = j, y = Math.log(months[t - window + j][1]);
      sx += x; sy += y; sxx += x * x; sxy += x * y;
    }
    const b = (window * sxy - sx * sy) / (window * sxx - sx * sx);
    const a = (sy - b * sx) / window;
    let ss = 0;
    for (let j = 0; j < window; j++) ss += (Math.log(months[t - window + j][1]) - a - b * j) ** 2;
    const sd = Math.sqrt(ss / (window - 2));
    const mid = Math.exp(a + b * window);
    out.push({
      d: months[t][0], mid, sd, pos: (Math.log(months[t][1]) - Math.log(mid)) / sd,
      u1: mid * Math.exp(sd), l1: mid * Math.exp(-sd), l2: mid * Math.exp(-2 * sd),
    });
  }
  return out;
}

// 用实时价得到"当前通道":把当月收盘替换为实时价后重算最后一期
// dividend: 通道在hfq口径,实时价需除以ratio;展示时再乘回
export function curChannel(key, livePrice, monthlies, ratio) {
  const isDiv = key === 'dividend';
  const r = isDiv ? ratio : 1;
  const m = monthlies.map(x => [x[0], x[1]]);
  const nat = isDiv ? livePrice / r : livePrice;
  const d = new Date(), ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  if (m.length && m[m.length - 1][0] === ym) m[m.length - 1][1] = nat;
  else m.push([ym, nat]);
  const rows = chan(m), last = rows[rows.length - 1];
  return {
    rows: rows.map(x => ({
      d: x.d, mid: x.mid * r, u1: x.u1 * r, l1: x.l1 * r, l2: x.l2 * r,
    })),
    last: {
      mid: last.mid * r, sd: last.sd, pos: last.pos,
      u1: last.u1 * r, l15: last.mid * Math.exp(-1.5 * last.sd) * r,
      l1: last.l1 * r, l2: last.l2 * r,
    },
  };
}
