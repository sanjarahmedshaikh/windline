from __future__ import annotations

import json
import math
import time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import urlopen

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"
JAN_START = datetime(2026, 1, 1, tzinfo=timezone.utc)
JAN_END = datetime(2026, 2, 1, tzinfo=timezone.utc)
cache: dict[str, tuple[float, list[dict]]] = {}


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def pick(row: dict, *names: str):
    for name in names:
        if name in row:
            return row[name]
    return None


def normalise(rows: list[dict], kind: str) -> list[dict]:
    result = []
    for row in rows:
        start, generation = pick(row, "startTime", "start_time"), pick(row, "generation", "Generation")
        if not start or generation is None or (kind == "actual" and str(pick(row, "fuelType", "fuel_type") or "").upper() != "WIND"):
            continue
        try:
            result.append({"startTime": start, "publishTime": pick(row, "publishTime", "publish_time"), "generation": float(generation)})
        except (TypeError, ValueError):
            continue
    return result


def fetch_dataset(dataset: str, start: datetime, end: datetime, publish_time: datetime | None = None) -> list[dict]:
    key = f"{dataset}:{start.isoformat()}:{end.isoformat()}:{publish_time}"
    cached = cache.get(key)
    if cached and time.time() - cached[0] < 300:
        return cached[1]
    if dataset == "FUELHH":
        params = {"settlementDateFrom": start.date().isoformat(), "settlementDateTo": end.date().isoformat()}
        url = f"{BASE_URL}/datasets/FUELHH/stream?{urlencode(params)}"
    else:
        params = {"from": start.isoformat().replace("+00:00", "Z"), "to": end.isoformat().replace("+00:00", "Z"), "publishTime": (publish_time or end).isoformat().replace("+00:00", "Z")}
        url = f"{BASE_URL}/forecast/generation/wind/history?{urlencode(params)}"
    try:
        with urlopen(url, timeout=45) as response:
            payload = json.load(response)
    except Exception as exc:
        raise RuntimeError(f"Elexon request failed for {dataset}: {exc}") from exc
    rows = payload if isinstance(payload, list) else payload.get("data", payload.get("results", []))
    if not isinstance(rows, list):
        raise RuntimeError(f"Unexpected Elexon response for {dataset}")
    cache[key] = (time.time(), rows)
    return rows


def accuracy(points: list[dict[str, float]]) -> dict[str, float | int | None]:
    errors = [p["forecast"] - p["actual"] for p in points]
    absolute = [abs(error) for error in errors]
    actual_positive = [p for p in points if p["actual"] > 0]
    return {"points": len(points), "mae": round(sum(absolute) / len(absolute), 1) if points else None, "rmse": round(math.sqrt(sum(error * error for error in errors) / len(errors)), 1) if points else None, "bias": round(sum(errors) / len(errors), 1) if points else None, "mape": round(sum(abs(p["forecast"] - p["actual"]) / p["actual"] for p in actual_positive) / len(actual_positive) * 100, 1) if actual_positive else None}


def analysis(date: str = "2026-01-27") -> dict:
    delivery = parse_time(f"{date}T00:00:00+00:00")
    if not delivery or delivery < JAN_START or delivery >= JAN_END:
        raise ValueError("Choose a delivery date in January 2026")
    start, end = delivery - timedelta(days=1), delivery + timedelta(days=1)
    actual_rows = fetch_dataset("FUELHH", start, end)
    forecast_rows = fetch_dataset("WINDFOR", delivery, end, delivery - timedelta(seconds=1))
    actuals, forecasts = normalise(actual_rows, "actual"), normalise(forecast_rows, "forecast")
    actual_by_start = {row["startTime"]: row for row in actuals if str(row["startTime"]).startswith(date)}
    selected: dict[str, dict] = {}
    for row in forecasts:
        if not str(row["startTime"]).startswith(date):
            continue
        published = parse_time(row["publishTime"])
        current = selected.get(row["startTime"])
        if published and published <= delivery - timedelta(seconds=1) and (not current or parse_time(current["publishTime"]) < published):
            selected[row["startTime"]] = row
    points = [{"startTime": key, "forecast": row["generation"], "actual": actual_by_start[key]["generation"], "publishTime": row["publishTime"]} for key, row in sorted(selected.items()) if key in actual_by_start]
    return {"deliveryDate": date, "decisionRule": "Latest forecast published by 23:59 UTC the day before delivery", "latestForecast": max(selected.values(), key=lambda row: row["startTime"], default=None), "metrics": accuracy(points), "points": points, "source": {"actuals": "FUELHH", "forecasts": "WINDFOR"}}


FRONTEND = Path(__file__).resolve().parent.parent / "frontend" / "dist"


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status: int, payload: dict):
        body = json.dumps(payload).encode()
        self.send_response(status); self.send_header("Content-Type", "application/json"); self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

    def send_file(self, path: Path):
        body = path.read_bytes(); content_type = "text/html" if path.suffix == ".html" else "text/css" if path.suffix == ".css" else "application/javascript"
        self.send_response(200); self.send_header("Content-Type", content_type); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            return self.send_json(200, {"status": "ok"})
        if parsed.path == "/api/analysis":
            try:
                return self.send_json(200, analysis(parse_qs(parsed.query).get("date", ["2026-01-27"])[0]))
            except ValueError as exc:
                return self.send_json(400, {"detail": str(exc)})
            except RuntimeError as exc:
                return self.send_json(502, {"detail": str(exc)})
        if FRONTEND.exists():
            target = FRONTEND / parsed.path.lstrip("/")
            return self.send_file(target if parsed.path.startswith("/assets/") and target.is_file() else FRONTEND / "index.html")
        return self.send_json(404, {"detail": "Not found"})

    def log_message(self, *_args):
        return


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 5173), Handler).serve_forever()
