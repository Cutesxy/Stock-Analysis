"""历史K线服务:腾讯 fqkline 接口,支持翻页抓取全量历史与磁盘缓存。

接口限制:单次最多640根;hfq 当日bar是未复权价 → 始终丢弃今天的数据。
缓存:内存 + backend/data/kline_cache.json(断网时回退到最后一次成功的数据)。
"""
import json
import time
from datetime import datetime, timedelta
from pathlib import Path

from curl_cffi import requests as cr

from ..config import KLINE_TTL

BASE = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get"
CACHE_DIR = Path(__file__).resolve().parent.parent / "data"
CACHE_FILE = CACHE_DIR / "kline_cache.json"

_mem = {}       # {cache_key: (ts, rows)}
_disk_ok = None # 缓存文件是否可用


def _fetch_page(sym: str, fq: str, end: str, n: int) -> list:
    """抓一页K线,end为空表示从最新开始。返回 [[date, close], ...]"""
    param = f"{sym},day,,{end},{n},{fq}" if end else f"{sym},day,,,{n},{fq}"
    r = cr.get(BASE, params={"param": param}, impersonate="chrome", timeout=15)
    j = r.json()
    data = j["data"][sym]
    # 响应键名是 {fq}day(qfqday/hfqday),不复权时是 day
    k = data.get(f"{fq}day") or data.get("day") or []
    return [[row[0], float(row[2])] for row in k]


def fetch_kline(sym: str, fq: str = "", paged: bool = False, target: int = 640) -> list:
    """抓取K线(收盘价)。

    paged=True 时向后翻页直至取满 target 根(用于需要完整历史的通道计算);
    始终剔除今天的数据(未复权问题),返回按日期升序的 [[date, close], ...]。
    """
    rows = _fetch_page(sym, fq, "", 640)
    if paged:
        need = target - len(rows)
        while need > 0:
            earliest = rows[0][0]
            end = (datetime.strptime(earliest, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
            page = _fetch_page(sym, fq, end, 640)
            if not page or page[-1][0] >= earliest:  # 无更早数据
                break
            rows = page[:-1] + rows if page[-1][0] < earliest else page + rows
            need = target - len(rows)
    today = datetime.now().strftime("%Y-%m-%d")
    rows = [r for r in rows if r[0] != today]
    rows.sort(key=lambda r: r[0])
    seen, uniq = set(), []
    for r in rows:
        if r[0] not in seen:
            seen.add(r[0])
            uniq.append(r)
    return uniq


def get_klines(symbols: dict, full: bool = False) -> dict:
    """批量获取并缓存。symbols: {key: {code, fq, paged}}, full=True 时取全量历史。"""
    global _disk_ok
    if _disk_ok is None:
        _disk_ok = {}
        if CACHE_FILE.exists():
            try:
                _disk_ok = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
            except Exception:
                _disk_ok = {}
    out, changed, now = {}, False, time.time()
    for key, s in symbols.items():
        ck = f"{key}|{s['fq']}"
        if not full and ck in _mem and now - _mem[ck][0] < KLINE_TTL:
            out[key] = _mem[ck][1]
            continue
        try:
            rows = fetch_kline(s["code"], s["fq"], s.get("paged", False), target=2500 if full else 640)
            _mem[ck] = (now, rows)
            out[key] = rows
            changed = True
        except Exception:
            # 断网回退:优先内存缓存,其次磁盘缓存
            if ck in _mem:
                out[key] = _mem[ck][1]
            elif ck in _disk_ok:
                out[key] = _disk_ok[ck]
                _mem[ck] = (0.0, out[key])  # 打标记,避免反复报错
            else:
                raise RuntimeError(f"无法获取 {s['code']} 行情数据(网络不可用且无缓存)")
    if changed:
        _save_disk(_mem)
    return out


def _save_disk(mem: dict):
    try:
        CACHE_DIR.mkdir(exist_ok=True)
        payload = {k: v[1] for k, v in mem.items()}
        CACHE_FILE.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass  # 缓存写失败不影响主流程
