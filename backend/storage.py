"""流水账存储:SQLite。个人交易数据只存本机 backend/data/ledger.db(gitignore)。"""
import sqlite3
import time
import uuid
from pathlib import Path

DB_FILE = Path(__file__).resolve().parent / "data" / "ledger.db"
ACTS = {"买入", "卖出", "分红", "入金"}


def _conn():
    DB_FILE.parent.mkdir(exist_ok=True)
    c = sqlite3.connect(DB_FILE)
    c.execute("""CREATE TABLE IF NOT EXISTS ledger(
        id TEXT PRIMARY KEY, date TEXT NOT NULL, etf TEXT NOT NULL,
        act TEXT NOT NULL, price REAL NOT NULL DEFAULT 0,
        shares REAL NOT NULL DEFAULT 0, fee REAL NOT NULL DEFAULT 0,
        note TEXT DEFAULT '', ts REAL NOT NULL)""")
    return c


def load() -> list:
    """读取全部流水(按时间升序)。"""
    with _conn() as c:
        cur = c.execute("SELECT id,date,etf,act,price,shares,fee,note FROM ledger ORDER BY date, ts")
        return [{"id": r[0], "date": r[1], "etf": r[2], "act": r[3],
                 "price": r[4], "shares": r[5], "fee": r[6], "note": r[7]} for r in cur]


def save(rows: list) -> int:
    """整表替换(前端为唯一数据源,简单可靠)。"""
    with _conn() as c:
        c.execute("DELETE FROM ledger")
        for r in rows:
            if r.get("act") not in ACTS:
                raise ValueError(f"非法动作: {r.get('act')}")
            if not r.get("date") or not r.get("etf"):
                raise ValueError("流水缺少 date/etf")
            c.execute("INSERT INTO ledger VALUES(?,?,?,?,?,?,?,?,?)",
                      (r.get("id") or uuid.uuid4().hex[:10], r["date"], r["etf"], r["act"],
                       float(r.get("price") or 0), float(r.get("shares") or 0),
                       float(r.get("fee") or 0), str(r.get("note") or ""), time.time()))
        return len(rows)


def seed_demo() -> int:
    """写入演示数据(纯示例,非真实交易)。"""
    demo = [
        {"id": "demo1", "date": "2026-01-05", "etf": "cash", "act": "入金", "price": 0, "shares": 10000, "fee": 0, "note": "示例:入金1万"},
        {"id": "demo2", "date": "2026-01-06", "etf": "dividend", "act": "买入", "price": 1.35, "shares": 3000, "fee": 1, "note": "示例:红利建仓"},
        {"id": "demo3", "date": "2026-01-06", "etf": "games", "act": "买入", "price": 1.10, "shares": 900, "fee": 0.5, "note": "示例:游戏建仓"},
        {"id": "demo4", "date": "2026-03-10", "etf": "games", "act": "买入", "price": 1.05, "shares": 500, "fee": 0.5, "note": "示例:回踩加仓"},
    ]
    return save(demo)
