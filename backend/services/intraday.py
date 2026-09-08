# 分时数据:腾讯 minute/query(当日分钟线,含昨收)
import time

import curl_cffi.requests as cr

BASE = "https://web.ifzq.gtimg.cn/appstock/app/minute/query"
_cache: dict = {}   # code -> (ts, payload)


def get_minute(code: str, ttl: int = 20) -> dict:
    """返回 {date, prev, points:[[HHMM, price, cumvol]...]}。缓存20秒。"""
    now = time.time()
    if code in _cache and now - _cache[code][0] < ttl:
        return _cache[code][1]
    r = cr.get(BASE, params={"code": code}, impersonate="chrome", timeout=8)
    j = r.json()
    d = j["data"][code]
    pts = []
    for p in d["data"]["data"]:
        f = p.split()
        if len(f) >= 3:
            pts.append([f[0], float(f[1]), float(f[2])])
    prev = None
    try:
        prev = float(d["qt"][code][4])
    except Exception:
        pass
    out = {"date": d["data"]["date"], "prev": prev, "points": pts}
    _cache[code] = (now, out)
    return out
