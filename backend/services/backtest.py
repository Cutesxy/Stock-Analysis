"""回测服务:锚点模拟、分区胜率、同构事件、追涨检验。

口径(DEVELOPMENT.md 有完整说明):
- 通道:月线36月滚动OLS(log价)+±1σ残差带,滚动=无未来函数
- 锚点:沪深300月线通道 pos≤-1σ 的月份(2021-07起),每锚点持有12个月
- E方案:进攻仓止损只认指数(上证120日低点),止盈=加权成本×1.135/×1.231
  档位=当时持仓的1/3(先卖1/3,再卖剩余的1/2,余1/3骑到终点)
- 全部为历史模拟,样本=一轮熊市,不构成投资建议
"""
import math

from ..config import BACKTEST as BT, RULES


# ------------------------------------------------------------------
# 基础工具
# ------------------------------------------------------------------
def _ma(series: list, n: int) -> list:
    """滚动均值,前 n-1 个为 None。series: [close, ...]"""
    out, acc = [], 0.0
    for i, v in enumerate(series):
        acc += v
        if i >= n:
            acc -= series[i - n]
        out.append(acc / n if i >= n - 1 else None)
    return out


def _clopper_pearson(k: int, n: int, alpha: float = 0.05) -> tuple:
    """二项分布精确置信区间(二分求根)。F(X≤k;p) 关于 p 递减。"""
    eps = 1e-12
    if k == 0:
        return 0.0, 1.0 - (alpha / 2) ** (1 / n)
    if k == n:
        return (alpha / 2) ** (1 / n), 1.0

    def cdf(p, x):  # P(X <= x),X~Bin(n,p)
        if p <= eps:
            return 1.0 if x >= n else 0.0
        if p >= 1 - eps:
            return 1.0 if x >= n else 0.0
        pmf = (1 - p) ** n
        c = pmf
        for i in range(x):
            pmf *= (p / (1 - p)) * (n - i) / (i + 1)
            c += pmf
        return min(max(c, 0.0), 1.0)

    def solve(x: int, target: float) -> float:  # 解 cdf(p,x)=target(cdf对p递减)
        lo, hi = eps, 1 - eps
        for _ in range(80):
            m = (lo + hi) / 2
            if cdf(m, x) > target:
                lo = m
            else:
                hi = m
        return (lo + hi) / 2

    return solve(k - 1, 1 - alpha / 2), solve(k, alpha / 2)


def _stats(rets: list) -> dict:
    if not rets:
        return {"n": 0, "win": None, "avg": None, "worst": None, "best": None, "ci": None}
    wins = sum(1 for r in rets if r > 0)
    lo, hi = _clopper_pearson(wins, len(rets))
    return {"n": len(rets), "win": wins / len(rets), "avg": sum(rets) / len(rets),
            "worst": min(rets), "best": max(rets), "ci": [lo, hi]}


# ------------------------------------------------------------------
# 分区胜率表:月线通道σ位置 → 12个月前瞻收益
# ------------------------------------------------------------------
def zone_table(monthlies: list, cuts: list) -> list:
    from .channel import channel_rows
    rows = channel_rows(monthlies)
    buckets = {i: [] for i in range(len(cuts) + 1)}
    win = BT["channel_months"]
    for i, r in enumerate(rows):
        t = win + i
        if t + 12 >= len(monthlies):
            continue
        fwd = monthlies[t + 12][1] / monthlies[t][1] - 1
        idx = sum(1 for c in cuts if r["pos"] > c)
        buckets[idx].append(fwd)
    bounds = [-math.inf] + list(cuts) + [math.inf]
    out = []
    for i in range(len(cuts) + 1):
        b = buckets[i]
        name = (("≤" if i == 0 else "") + (f"{cuts[i-1]:+.1f}σ~" if 0 < i <= len(cuts) else "")
                + (f"{cuts[i]:+.1f}σ" if i < len(cuts) else ""))
        if i == 0:
            name = f"≤{cuts[0]:+.1f}σ" if cuts[0] < 0 else f"<{cuts[0]:+.1f}σ"
        elif i == len(cuts):
            name = f">{cuts[-1]:+.1f}σ"
        if b:
            out.append([name, sum(1 for r in b if r > 0) / len(b), sum(b) / len(b), len(b)])
        else:
            out.append([name, None, None, 0])
    return out


# ------------------------------------------------------------------
# 事件发现
# ------------------------------------------------------------------
def find_events(gd: list) -> list:
    """同构事件:120日低点反弹7~17%、仍在MA250下方,每5个交易日采样。"""
    closes = [c for _, c in gd]
    ma250 = _ma(closes, 250)
    evs = []
    for i in range(260, len(gd) - 252, BT["event_step"]):
        if ma250[i] is None:
            continue
        low = min(closes[i - 120:i + 1])
        cur = closes[i]
        if BT["rebound_lo"] <= cur / low - 1 <= BT["rebound_hi"] and cur < ma250[i]:
            evs.append(i)
    return evs


def find_chase_events(gd: list) -> list:
    """低区突破事件:收盘创20日新高且仍在MA250下方,间隔≥20交易日。"""
    closes = [c for _, c in gd]
    ma250 = _ma(closes, 250)
    evs, last = [], -999
    for i in range(250, len(gd) - 252):
        if ma250[i] is None:
            continue
        if closes[i] > max(closes[i - 20:i]) and closes[i] < ma250[i]:
            if i - last >= 20:
                evs.append(i)
                last = i
    return evs


# ------------------------------------------------------------------
# E方案事件模拟
# ------------------------------------------------------------------
def simulate_escheme(gd: list, sse: list, i: int) -> dict:
    """E方案:止损=上证120日低点(锚定入场时);止盈=成本×1.135卖1/3、
    ×1.231卖剩余的1/2,余仓持有至252交易日。"""
    gc = [c for _, c in gd]
    sc = [c for _, c in sse]
    entry = gc[i]
    sse_low = min(sc[max(0, i - 120):i + 1])
    tp1m = RULES["games"]["tp1_mult"]
    tp2m = RULES["games"]["tp2_mult"]
    sh, cash = 1.0, 0.0
    t1 = t2 = False
    for j in range(i + 1, min(i + 253, len(gd))):
        p, s = gc[j], sc[j]
        if s <= sse_low:
            return {"ret": (cash + sh * p) / entry - 1, "stopped": True}
        if not t1 and p >= entry * tp1m:
            cash += sh / 3 * p; sh -= sh / 3; t1 = True
        if t1 and not t2 and p >= entry * tp2m:
            half = sh / 2; cash += half * p; sh -= half; t2 = True
    return {"ret": (cash + sh * gc[min(i + 252, len(gd) - 1)]) / entry - 1, "stopped": False}


# ------------------------------------------------------------------
# 锚点组合模拟
# ------------------------------------------------------------------
def _games_leg(gc, sc, anchor_i, mode, hh20):
    """锚点入场后的进攻仓推演(金额口径)。

    主仓 main_shares 股@锚点价;加仓资金池=等值股数按锚点价折算;
    mode: N=不加仓 A=回踩 B=突破 C=立即 D=混合(回踩+突破两段)。
    """
    P0 = gc[anchor_i]
    main_sh = float(BT["main_shares"])
    pf = BT["portfolio"]
    pool = main_sh * P0  # 加仓预算(等值一股数×锚点价)
    start_val = pf["dividend_value"] + main_sh * P0 + pool + pf["cash_value"]
    shares = main_sh
    invested = main_sh * P0
    cash = 0.0
    t1 = t2 = False
    dip_done = break_done = False
    dip_budget = BT["dip_shares"] * P0  # 混合方案回踩档资金
    tp1m, tp2m = RULES["games"]["tp1_mult"], RULES["games"]["tp2_mult"]
    sse_stop_line = min(sc[max(0, anchor_i - 120):anchor_i + 1])
    end_i = min(anchor_i + 252, len(gc) - 1)

    for j in range(anchor_i + 1, end_i + 1):
        p = gc[j]
        # ---- 加仓(观察窗口内) ----
        if j - anchor_i <= BT["add_window_days"] and pool > 1e-6:
            if mode == "A" and p <= P0 * BT["add_dip_pct"]:
                shares += pool / p; invested += pool; pool = 0.0
            elif mode == "B" and hh20[j] is not None and p > hh20[j]:
                shares += pool / p; invested += pool; pool = 0.0
            elif mode == "C" and j == anchor_i + 1:
                shares += pool / p; invested += pool; pool = 0.0
            elif mode == "D":
                if not dip_done and p <= P0 * BT["add_dip_pct"]:
                    amt = min(dip_budget, pool)
                    shares += amt / p; invested += amt; pool -= amt; dip_done = True
                if not break_done and hh20[j] is not None and p > hh20[j] and pool > 1e-6:
                    shares += pool / p; invested += pool; pool = 0.0; break_done = True
        # ---- 止损(上证锚) ----
        if sc[j] <= sse_stop_line:
            cash += shares * p
            shares = 0.0
            break
        # ---- 阶梯止盈(按加权成本) ----
        if shares > 0:
            cost = invested / shares
            if not t1 and p >= cost * tp1m:
                s = shares / 3; cash += s * p; shares -= s; invested -= s * cost; t1 = True
            if t1 and not t2 and p >= cost * tp2m:
                s = shares / 2; cash += s * p; shares -= s; invested -= s * cost; t2 = True
    if shares > 0:
        cash += shares * gc[end_i]
    return {"final": cash + pool * (1 + BT["cash_yield"]), "start": start_val}


def _anchor_index(gd: list, anchor_ym: str):
    """锚点月在游戏日线上的索引:该月(含)之前最后一个交易日。"""
    idx = None
    for i, (d, _) in enumerate(gd):
        if d[:7] <= anchor_ym:
            idx = i
        else:
            break
    return idx


def simulate_portfolio(gd, sse, div_monthlies, anchor_ym, mode, hh20):
    """锚点组合:红利买入持有 + 进攻仓(mode) + 现金。返回组合收益率。"""
    anchor_i = _anchor_index(gd, anchor_ym)
    if anchor_i is None or anchor_i + 252 >= len(gd):
        return None
    div = dict(div_monthlies)
    if anchor_ym not in div:
        return None
    y, m = int(anchor_ym[:4]), int(anchor_ym[5:7])
    yy, mm = y + (m - 1 + 12) // 12, (m - 1) % 12 + 1
    end_ym = f"{yy:04d}-{mm:02d}"
    if end_ym not in div:
        return None
    r_div = div[end_ym] / div[anchor_ym] - 1
    gc = [c for _, c in gd]
    sc = [c for _, c in sse]
    leg = _games_leg(gc, sc, anchor_i, mode, hh20)
    end_val = (BT["portfolio"]["dividend_value"] * (1 + r_div) + leg["final"]
               + BT["portfolio"]["cash_value"] * (1 + BT["cash_yield"]))
    return end_val / leg["start"] - 1


# ------------------------------------------------------------------
# 总入口
# ------------------------------------------------------------------
def _align(base: list, other: list) -> list:
    """把 other 对齐到 base 的日期(前向填充,开头用首个可得值)。"""
    m = dict(other)
    out, last = [], None
    for d, _ in base:
        if d in m:
            last = m[d]
        out.append([d, last])
    if out and out[0][1] is None:  # 开头缺失:用最早可得值回填
        first = next((v for _, v in out if v is not None), None)
        out = [[d, first if v is None else v] for d, v in out]
    return out


def compute_stats(gd, sse, div_monthlies, hs_monthlies, gam_monthlies) -> dict:
    """全部回测统计。gd/sse: 日线 [[date, close], ...];其余: 月线。
    sse 会先按 gd 的日期对齐(前向填充)。"""
    from .channel import channel_rows
    sse = _align(gd, sse)
    gc = [c for _, c in gd]
    hh20 = [None] * len(gc)
    for i in range(20, len(gc)):
        hh20[i] = max(gc[i - 20:i])

    # ---- 锚点:沪深300月线通道 pos≤-1σ ----
    win = BT["channel_months"]
    anchors = [r["d"] for r in channel_rows(hs_monthlies, win)
               if r["pos"] <= -1.0 and r["d"] >= BT["anchor_start"]]
    valid_anchors = [a for a in anchors if a < hs_monthlies[-13][0]]

    # ---- 五种加仓方式 ----
    modes = {"N": "N · 不加仓(资金留现金)",
             "A": "A · 只等回踩加仓",
             "B": "B · 突破确认追涨",
             "C": "C · 立即市价加仓",
             "D": "D · 混合:回踩+突破(采用)"}
    mode_rets = {}
    for m in modes:
        rets = [simulate_portfolio(gd, sse, div_monthlies, a, m, hh20) for a in valid_anchors]
        mode_rets[m] = [r for r in rets if r is not None]
    mode_table = []
    for m, label in modes.items():
        st = _stats(mode_rets[m])
        mode_table.append([label, st["win"], st["avg"], st["worst"]])

    # ---- 当前系统(D)分段 ----
    d_rets = mode_rets["D"]
    mid_mask = [a <= "2022-02" for a in valid_anchors[:len(d_rets)]]
    mid = [r for r, m in zip(d_rets, mid_mask) if m] or [0.0]
    late = [r for r, m in zip(d_rets, mid_mask) if not m] or [0.0]
    st = _stats(d_rets)

    # ---- 同构事件 ----
    evs = find_events(gd)
    hold_rets, es_rets, strict_rets, stopped_n = [], [], [], 0
    tp1m, tp2m = RULES["games"]["tp1_mult"], RULES["games"]["tp2_mult"]
    for i in evs:
        hold_rets.append(gc[min(i + 252, len(gc) - 1)] / gc[i] - 1)
        es = simulate_escheme(gd, sse, i)
        es_rets.append(es["ret"])
        if es["stopped"]:
            stopped_n += 1
        entry = gc[i]
        low120 = min(gc[max(0, i - 120):i + 1])
        r = None
        for j in range(i + 1, min(i + 253, len(gd))):
            if gc[j] <= low120:
                r = gc[j] / entry - 1; break
            if gc[j] >= entry * 1.15:
                r = 0.15; break
        if r is None:
            r = gc[min(i + 252, len(gc) - 1)] / entry - 1
        strict_rets.append(r)
    ev_hold, ev_es, ev_strict = _stats(hold_rets), _stats(es_rets), _stats(strict_rets)

    # ---- 追涨事件 ----
    cevs = find_chase_events(gd)
    chase_rets = [gc[i + 252] / gc[i] - 1 for i in cevs]
    held, failed, dips = [], [], []
    for i in cevs:
        bp = gc[i]
        seg = gc[i + 1:i + 61]
        (failed if any(p < bp * 0.98 for p in seg) else held).append(i)
        dips.append(min(gc[i + 1:i + 253]) / bp - 1)
    dips.sort()
    ce_st = _stats(chase_rets)
    ce_fail = _stats([gc[i + 252] / gc[i] - 1 for i in failed])

    return {
        "system": {
            "win": st["win"], "avg": st["avg"], "worst": st["worst"],
            "mid": sum(mid) / len(mid), "late": sum(late) / len(late),
            "ci": st["ci"], "n": st["n"],
            "note": (f"{st['n']}锚点(沪深300≤-1σ月,{BT['anchor_start'][:7]}起)·E方案·"
                     "主仓+回踩/突破两段加仓·一轮熊市样本内拟合"),
        },
        "mode_table": mode_table,
        "mode_note": "同一系统下五种加仓方式:胜率基本不变(由规则决定),差别在期望与尾部;追涨比等回踩期望更高,代价是最差锚点更深",
        "dividend_zones": zone_table(div_monthlies, BT["zone_cuts_dividend"]),
        "games_zones": zone_table(gam_monthlies, BT["zone_cuts_games"]),
        "games_zones_note": "游戏上市较晚,分区样本极小(单格n≤4),仅展示不用于结论",
        "games_events": {
            "n": ev_es["n"], "hold_win": ev_hold["win"], "hold_avg": ev_hold["avg"],
            "escheme_win": ev_es["win"], "escheme_avg": ev_es["avg"],
            "escheme_stop_rate": stopped_n / max(len(es_rets), 1),
            "strict_win": ev_strict["win"], "strict_avg": ev_strict["avg"],
            "note": (f"同构事件(120日低点反弹7~17%·MA250下方,共{len(evs)}个):"
                     f"纯持有12月胜率{(ev_hold['win'] or 0)*100:.0f}%/平均{(ev_hold['avg'] or 0)*100:+.1f}%;"
                     f"E方案(指数止损+阶梯止盈){(ev_es['win'] or 0)*100:.0f}%/{(ev_es['avg'] or 0)*100:+.1f}%;"
                     f"严格止损止盈(前低+15%)仅{(ev_strict['win'] or 0)*100:.0f}%/{(ev_strict['avg'] or 0)*100:+.1f}%"
                     "——止损锚定指数优于锚定板块"),
        },
        "chase_events": {
            "n": ce_st["n"], "win": ce_st["win"], "avg": ce_st["avg"],
            "dip_med": dips[len(dips) // 2], "dip_worst": min(dips),
            "fail_n": len(failed), "fail_win": ce_fail["win"], "fail_avg": ce_fail["avg"],
            "note": (f"低区20日新高共{ce_st['n']}个事件:12月胜率{(ce_st['win'] or 0)*100:.0f}%/"
                     f"平均{(ce_st['avg'] or 0)*100:+.1f}%;其中{len(failed)}个曾跌回突破价下方,"
                     f"最终仍{(ce_fail['win'] or 0)*100:.0f}%胜——突破失败≠剧本失败"),
        },
        "rec_weights": _rec_weights(),
    }


def _rec_weights() -> dict:
    """推荐配置权重(按回测基准组合,参考价水平估算)。"""
    pf = BT["portfolio"]
    games_val = (BT["main_shares"] + BT["dip_shares"] + BT["break_shares"]) * 1.13
    total = pf["dividend_value"] + games_val + pf["cash_value"]
    return {"games": games_val / total, "dividend": pf["dividend_value"] / total,
            "cash": pf["cash_value"] / total}
