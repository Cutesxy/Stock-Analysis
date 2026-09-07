"""实时行情服务:腾讯 qt.gtimg.cn。

返回格式(未加引号):
    v_sz159869=51~游戏ETF~sz159869~1.147~...
字段索引:[1]名称 [3]现价 [4]昨收 [30]时间戳 [32]涨跌幅
"""
from curl_cffi import requests as cr

URL = "https://qt.gtimg.cn/q="


def fetch_quotes(symbols: dict) -> dict:
    """symbols: config.SYMBOLS 的子集,返回 {code_key: {name,price,prev,pct,time}}"""
    codes = ",".join(s["code"] for s in symbols.values())
    r = cr.get(URL + codes, impersonate="chrome", timeout=8)
    out = {}
    for line in r.text.strip().split(";"):
        line = line.strip()
        if "=" not in line:
            continue
        key = line.split("=", 1)[0].strip().replace("v_", "")
        raw = line.split("=", 1)[1].strip().rstrip(";").strip('"')
        p = raw.split("~")
        if len(p) < 35:
            continue
        try:
            out[key] = {
                "name": p[1],
                "price": float(p[3]),
                "prev": float(p[4]),
                "pct": float(p[32]),
                "time": p[30],
            }
        except (ValueError, IndexError):
            continue
    return out
