"""Stock-Analysis 后端入口:FastAPI。

职责:
1. /api/quotes   实时行情(代理腾讯,避免浏览器端跨域/格式问题)
2. /api/data     历史K线+通道+规则+回测统计(服务端算好,前端只渲染)
3. /api/stats    回测统计(可强制刷新)
4. /api/ledger   交易流水(SQLite持久化,前端整表同步)
5. /             前端静态文件(frontend/)
"""
import json as _json
from copy import deepcopy
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import storage
from .config import RULES, SYMBOLS, POLL_SECONDS
from .services import backtest, channel, kline, quotes

RULES_FILE = Path(__file__).parent / "data" / "rules_override.json"


def _deep_merge(base: dict, patch: dict) -> dict:
    """只覆盖已存在键的叶子值(忽略未知键),递归dict。"""
    for k, v in (patch or {}).items():
        if k in base and isinstance(base[k], dict) and isinstance(v, dict):
            _deep_merge(base[k], v)
        elif k in base and not isinstance(base[k], dict):
            base[k] = v
    return base


def _merged_rules() -> dict:
    base = deepcopy(RULES)
    if RULES_FILE.exists():
        try:
            _deep_merge(base, _json.loads(RULES_FILE.read_text(encoding="utf-8")))
        except Exception:
            pass
    return base

app = FastAPI(title="Stock-Analysis", description="双ETF量化作战系统(个人研究工具,不构成投资建议)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_state = {}  # 进程内缓存:{data: {...}, stats_ts: float}


def _build_data(force: bool = False) -> dict:
    """全量数据(历史+通道+规则+统计),带进程缓存。"""
    if not force and "data" in _state:
        return _state["data"]
    kl = kline.get_klines({
        "games": SYMBOLS["games"],
        "dividend": {"code": SYMBOLS["dividend"]["code"], "fq": "hfq", "paged": True},
        "dividend_qfq": {"code": SYMBOLS["dividend"]["code"], "fq": "qfq", "paged": False},
        "sse": SYMBOLS["sse"],
        "hs300": SYMBOLS["hs300"],
    }, full=True)

    gd, sse = kl["games"], kl["sse"]
    div_hfq, div_qfq = kl["dividend"], kl["dividend_qfq"]
    gam_m = channel.to_monthlies(gd)
    div_m = channel.to_monthlies(div_hfq)
    hs_m = channel.to_monthlies(kl["hs300"])
    ratio = channel.spot_ratio(div_qfq, div_hfq)

    rules = _merged_rules()
    stats = backtest.compute_stats(gd, sse, div_m, hs_m, gam_m, rules)
    lv_div = channel.levels(div_m)
    lv_gam = channel.levels(gam_m)

    data = {
        "updated": gd[-1][0] if gd else "",
        "ratio": ratio,
        "symbols": {k: {"code": v["code"], "name": v["name"]} for k, v in SYMBOLS.items() if k != "hs300"},
        "games": {"daily": gd[-500:], "monthlies": gam_m, "levels": lv_gam},
        "dividend": {"daily": [ [d, round(c * ratio, 4)] for d, c in div_hfq[-500:] ],
                     "monthlies": div_m, "levels": lv_div},
        "sse": {"daily": sse[-500:]},
        "rules": rules,
        "stats": stats,
        "poll_seconds": POLL_SECONDS,
    }
    _state["data"] = data
    return data


# ------------------------------------------------------------------
# API
# ------------------------------------------------------------------
@app.get("/api/quotes")
def api_quotes():
    try:
        q = quotes.fetch_quotes({k: v for k, v in SYMBOLS.items() if k != "hs300"})
    except Exception as e:
        raise HTTPException(502, f"行情获取失败: {e}")
    out = {}
    for key, s in SYMBOLS.items():
        if key == "hs300":
            continue
        qd = q.get(s["code"])
        if qd:
            out[key] = qd
    if not out:
        raise HTTPException(502, "行情为空")
    return out


@app.get("/api/data")
def api_data():
    try:
        return _build_data()
    except Exception as e:
        raise HTTPException(502, f"数据构建失败: {e}")


@app.get("/api/stats")
def api_stats(refresh: bool = False):
    d = _build_data(force=refresh)
    return d["stats"]


@app.get("/api/ledger")
def api_ledger_get():
    return {"rows": storage.load()}


class LedgerRows(BaseModel):
    rows: list


@app.put("/api/ledger")
def api_ledger_put(body: LedgerRows):
    try:
        n = storage.save(body.rows)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"ok": True, "count": n}


@app.post("/api/ledger/demo")
def api_ledger_demo():
    return {"ok": True, "count": storage.seed_demo()}


@app.get("/api/rules")
def api_rules_get():
    return _merged_rules()


@app.put("/api/rules")
async def api_rules_put(payload: dict = Body(...)):
    """保存规则覆盖(只接受已存在键的数值/字符串叶子)。"""
    patch = payload.get("rules", payload)
    # 白名单校验:止盈倍率/价格合理区间
    base = deepcopy(RULES)
    merged = _deep_merge(base, deepcopy(patch))
    g = merged["games"]
    if not (1.0 < g["tp1_mult"] < 3.0 and 1.0 < g["tp2_mult"] < 3.0):
        raise HTTPException(422, "止盈倍率应在1.0~3.0之间")
    if g["tp2_mult"] <= g["tp1_mult"]:
        raise HTTPException(422, "止盈②倍率应大于止盈①")
    for a in g["adds"]:
        if not (0 < a["price"] < 100 and 0 < a["shares"] < 100000):
            raise HTTPException(422, "加仓价格/股数超出合理范围")
    if not (0 < g["sse_stop"] < 100000):
        raise HTTPException(422, "止损线超出合理范围")
    try:
        RULES_FILE.parent.mkdir(exist_ok=True)
        RULES_FILE.write_text(_json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        raise HTTPException(500, f"写入失败: {e}")
    _state.pop("data", None)  # 失效缓存,下次请求用新规则重算
    return _merged_rules()


@app.delete("/api/rules")
def api_rules_reset():
    if RULES_FILE.exists():
        RULES_FILE.unlink()
    _state.pop("data", None)
    return _merged_rules()


# ------------------------------------------------------------------
# 前端静态文件(挂载在最后,不遮蔽 /api)
# ------------------------------------------------------------------
FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")
