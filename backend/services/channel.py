"""通道计算服务:月线36个月滚动OLS(对数价)+±1σ残差带。

口径与前端实时重算保持一致:滚动窗口=无未来函数。
"""
import math
from datetime import datetime


def to_monthlies(daily: list) -> list:
    """日线 → 月线收盘 [[ym, close], ...](每月最后一个交易日)"""
    out = {}
    for date, close in daily:
        ym = date[:7]
        out[ym] = close
    return [[k, v] for k, v in sorted(out.items())]


def channel_rows(monthlies: list, window: int = 36) -> list:
    """滚动通道。返回 [{d, mid, sd, pos, u1, l1, l2}, ...]"""
    rows = []
    n = len(monthlies)
    for t in range(window, n):
        xs = list(range(window))
        ys = [math.log(monthlies[t - window + j][1]) for j in range(window)]
        sx = sum(xs); sy = sum(ys); sxx = sum(x * x for x in xs); sxy = sum(x * y for x, y in zip(xs, ys))
        b = (window * sxy - sx * sy) / (window * sxx - sx * sx)
        a = (sy - b * sx) / window
        ss = sum((y - a - b * x) ** 2 for x, y in zip(xs, ys))
        sd = math.sqrt(ss / (window - 2))
        mid = math.exp(a + b * window)
        pos = (math.log(monthlies[t][1]) - math.log(mid)) / sd
        rows.append({
            "d": monthlies[t][0], "mid": mid, "sd": sd, "pos": pos,
            "u1": mid * math.exp(sd), "l1": mid * math.exp(-sd), "l2": mid * math.exp(-2 * sd),
        })
    return rows


def levels(monthlies: list, window: int = 36) -> dict:
    """最新一期的通道关键位。"""
    rows = channel_rows(monthlies, window)
    if not rows:
        return {}
    r = rows[-1]
    return {
        "ym": r["d"], "mid": r["mid"], "sd": r["sd"], "pos": r["pos"],
        "u1": r["u1"], "l1": r["l1"], "l2": r["l2"],
        "l15": r["mid"] * math.exp(-1.5 * r["sd"]),
    }


def spot_ratio(qfq: list, hfq: list) -> float:
    """现价/后复权比(红利用:通道在hfq口径,展示折回现价)。"""
    if not qfq or not hfq:
        return 1.0
    today = datetime.now().strftime("%Y-%m-%d")
    q = [r for r in qfq if r[0] != today]
    h = [r for r in hfq if r[0] != today]
    if not q or not h:
        return 1.0
    return q[-1][1] / h[-1][1]
