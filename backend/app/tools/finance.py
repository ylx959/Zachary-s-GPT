"""
Investment analysis tools backed by Alpha Vantage.

Each tool returns (text for the model, chart spec for the UI) via LangChain's
"content_and_artifact" format. The model only sees the text; chat_stream.py
forwards the artifact to the browser as an SSE {"chart": ...} event, and the
frontend draws it (features/chat/components/stock-chart.tsx).

The free Alpha Vantage tier allows ~25 requests per day, so responses are
cached in-process for CACHE_TTL_SECONDS.
"""

import math
import statistics
import time
from typing import Any

import httpx
from langchain_core.tools import tool

from app.core.config import get_settings

API_URL = "https://www.alphavantage.co/query"
CACHE_TTL_SECONDS = 15 * 60
MAX_COMPARE = 4
BURST_WAIT_SECONDS = 1.5
TRADING_DAYS_PER_YEAR = 252
DISCLAIMER = "This is data analysis, not financial advice."

_cache: dict[tuple, tuple[float, dict]] = {}


class MarketDataError(Exception):
    """A user-readable reason why market data could not be loaded."""


# --- Alpha Vantage ---------------------------------------------------------

def _fetch(params: dict[str, str]) -> dict:
    """GET one Alpha Vantage function, with caching and its in-band error handling."""
    key = tuple(sorted(params.items()))
    cached = _cache.get(key)
    if cached and time.monotonic() - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    api_key = get_settings().alphavantage_api_key
    if not api_key:
        raise MarketDataError("ALPHAVANTAGE_API_KEY is not set in backend/.env.")

    for attempt in range(2):
        try:
            response = httpx.get(API_URL, params={**params, "apikey": api_key}, timeout=20)
            response.raise_for_status()
            data = response.json()
        except (httpx.HTTPError, ValueError) as e:
            raise MarketDataError(f"Alpha Vantage request failed: {e}") from e

        # Alpha Vantage reports errors with HTTP 200 and one of these keys.
        if "Error Message" in data:
            raise MarketDataError(f"Unknown symbol or bad request: {params.get('symbol')}")
        note = data.get("Note") or data.get("Information")
        if note and len(data) == 1:
            # The free tier also allows only ~1 request/second: wait once, then give up.
            if attempt == 0 and "second" in note.lower():
                time.sleep(BURST_WAIT_SECONDS)
                continue
            raise MarketDataError(f"Alpha Vantage refused the request: {note}")
        break

    _cache[key] = (time.monotonic(), data)
    return data


def daily_closes(symbol: str) -> list[tuple[str, float, float]]:
    """(date, close, volume) for the last ~100 trading days, oldest first."""
    data = _fetch({"function": "TIME_SERIES_DAILY", "symbol": symbol, "outputsize": "compact"})
    series = data.get("Time Series (Daily)")
    if not series:
        raise MarketDataError(f"No daily prices returned for {symbol}.")
    return [
        (day, float(bar["4. close"]), float(bar["5. volume"]))
        for day, bar in sorted(series.items())
    ]


# --- Indicators (pure, unit-tested) -----------------------------------------

def sma(values: list[float], window: int) -> list[float | None]:
    out: list[float | None] = []
    running = 0.0
    for i, v in enumerate(values):
        running += v
        if i >= window:
            running -= values[i - window]
        out.append(running / window if i >= window - 1 else None)
    return out


def rsi(values: list[float], period: int = 14) -> float | None:
    """Wilder's RSI of the last value."""
    if len(values) <= period:
        return None
    changes = [b - a for a, b in zip(values, values[1:])]
    gains = [max(c, 0) for c in changes]
    losses = [max(-c, 0) for c in changes]
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for g, l in zip(gains[period:], losses[period:]):
        avg_gain = (avg_gain * (period - 1) + g) / period
        avg_loss = (avg_loss * (period - 1) + l) / period
    if avg_loss == 0:
        return 100.0
    return 100 - 100 / (1 + avg_gain / avg_loss)


def annualized_volatility(values: list[float]) -> float | None:
    returns = [math.log(b / a) for a, b in zip(values, values[1:]) if a > 0 and b > 0]
    if len(returns) < 2:
        return None
    return statistics.stdev(returns) * math.sqrt(TRADING_DAYS_PER_YEAR)


def max_drawdown(values: list[float]) -> float:
    """Largest peak-to-trough fall, as a negative fraction (e.g. -0.18)."""
    peak, worst = values[0], 0.0
    for v in values:
        peak = max(peak, v)
        worst = min(worst, v / peak - 1)
    return worst


def pct_change(values: list[float], lookback: int) -> float | None:
    if len(values) <= lookback:
        return None
    return values[-1] / values[-1 - lookback] - 1


# --- Formatting ------------------------------------------------------------

def _pct(x: float | None) -> str:
    return "n/a" if x is None else f"{x:+.1%}"


def _tone(x: float | None) -> str | None:
    if x is None or x == 0:
        return None
    return "up" if x > 0 else "down"


def _round(values: list[float | None]) -> list[float | None]:
    return [None if v is None else round(v, 2) for v in values]


def _clean_symbol(symbol: str) -> str:
    return symbol.strip().upper()


# --- Tools -----------------------------------------------------------------

def build_stock_analysis(symbol: str) -> tuple[str, dict[str, Any]]:
    symbol = _clean_symbol(symbol)
    bars = daily_closes(symbol)
    dates = [d for d, _, _ in bars]
    closes = [c for _, c, _ in bars]
    volumes = [v for _, _, v in bars]

    sma20, sma50 = sma(closes, 20), sma(closes, 50)
    last = closes[-1]
    day = pct_change(closes, 1)
    month = pct_change(closes, 21)
    period = closes[-1] / closes[0] - 1
    vol = annualized_volatility(closes)
    dd = max_drawdown(closes)
    rsi14 = rsi(closes)

    trend = "n/a"
    if sma20[-1] is not None and sma50[-1] is not None:
        if last > sma20[-1] > sma50[-1]:
            trend = "uptrend (price > SMA20 > SMA50)"
        elif last < sma20[-1] < sma50[-1]:
            trend = "downtrend (price < SMA20 < SMA50)"
        else:
            trend = "mixed / sideways"

    lines = [
        f"{symbol} — daily data {dates[0]} to {dates[-1]} ({len(closes)} trading days), in the listing currency.",
        f"Last close {last:.2f}; 1-day {_pct(day)}; 1-month {_pct(month)}; whole period {_pct(period)}.",
        f"Period high {max(closes):.2f}, low {min(closes):.2f}; max drawdown {dd:.1%}.",
        f"Annualized volatility {'n/a' if vol is None else f'{vol:.1%}'}; RSI(14) {'n/a' if rsi14 is None else f'{rsi14:.0f}'}.",
        f"SMA20 {sma20[-1] or float('nan'):.2f}, SMA50 {sma50[-1] or float('nan'):.2f}; trend: {trend}.",
    ]
    lines.append("A price chart with SMA20/SMA50 and volume is already shown to the user above your answer; do not draw one in text.")
    lines.append(DISCLAIMER)

    chart = {
        "type": "price",
        "title": symbol,
        "subtitle": f"Daily close · {dates[0]} – {dates[-1]}",
        "unit": "currency",
        "dates": dates,
        "series": [
            {"name": "Close", "values": _round(closes), "role": "primary"},
            {"name": "SMA 20", "values": _round(sma20), "role": "overlay"},
            {"name": "SMA 50", "values": _round(sma50), "role": "overlay"},
        ],
        "volume": [round(v) for v in volumes],
        "stats": [
            {"label": "Last", "value": f"{last:,.2f}", "tone": _tone(day)},
            {"label": "1 day", "value": _pct(day), "tone": _tone(day)},
            {"label": "1 month", "value": _pct(month), "tone": _tone(month)},
            {"label": "Volatility", "value": "n/a" if vol is None else f"{vol:.0%}", "tone": None},
            {"label": "Max drawdown", "value": f"{dd:.1%}", "tone": "down" if dd < 0 else None},
            {"label": "RSI 14", "value": "n/a" if rsi14 is None else f"{rsi14:.0f}", "tone": None},
        ],
        "source": "Alpha Vantage",
    }
    return "\n".join(lines), chart


def build_stock_comparison(symbols: list[str]) -> tuple[str, dict[str, Any]]:
    cleaned = list(dict.fromkeys(_clean_symbol(s) for s in symbols if s.strip()))[:MAX_COMPARE]
    if len(cleaned) < 2:
        raise MarketDataError("Give at least two different ticker symbols to compare.")

    by_symbol = {s: dict((d, c) for d, c, _ in daily_closes(s)) for s in cleaned}
    # Align on the dates every symbol traded.
    dates = sorted(set.intersection(*(set(series) for series in by_symbol.values())))
    if len(dates) < 2:
        raise MarketDataError("These symbols have no overlapping trading days.")

    series, lines = [], [f"Comparison from {dates[0]} to {dates[-1]} ({len(dates)} common trading days), rebased to 0%:"]
    for s in cleaned:
        closes = [by_symbol[s][d] for d in dates]
        rebased = [c / closes[0] - 1 for c in closes]
        vol = annualized_volatility(closes)
        series.append({"name": s, "values": [round(r * 100, 2) for r in rebased], "role": "primary"})
        lines.append(
            f"- {s}: return {_pct(rebased[-1])}, max drawdown {max_drawdown(closes):.1%}, "
            f"volatility {'n/a' if vol is None else f'{vol:.1%}'}"
        )
    lines.append("A comparison chart is already shown to the user above your answer; do not draw one in text.")
    lines.append(DISCLAIMER)

    best = max(series, key=lambda x: x["values"][-1])
    chart = {
        "type": "compare",
        "title": " vs ".join(cleaned),
        "subtitle": f"Total return since {dates[0]}",
        "unit": "percent",
        "dates": dates,
        "series": series,
        "volume": None,
        "stats": [
            {"label": s["name"], "value": f"{s['values'][-1]:+.1f}%", "tone": _tone(s["values"][-1])}
            for s in series
        ],
        "source": "Alpha Vantage",
        "highlight": best["name"],
    }
    return "\n".join(lines), chart


@tool(response_format="content_and_artifact")
def analyze_stock(symbol: str) -> tuple[str, dict | None]:
    """
    Analyze one stock or ETF from recent daily prices and show the user a price chart.
    Returns price performance, volatility, drawdown, RSI and moving-average trend
    (no fundamentals: use web_search for earnings, valuation and news).
    Use for questions like "how is NVDA doing", "analyze TSLA", "show me AAPL's chart".
    symbol: the exchange ticker, e.g. AAPL, MSFT, VOO (US tickers work best).
    """
    try:
        return build_stock_analysis(symbol)
    except MarketDataError as e:
        return f"Could not analyze {symbol}: {e}", None


@tool(response_format="content_and_artifact")
def compare_stocks(symbols: list[str]) -> tuple[str, dict | None]:
    """
    Compare 2-4 stocks or ETFs over the same period and show the user a chart of
    their returns rebased to 0%. Use for "compare AAPL and MSFT", "NVDA vs AMD vs INTC".
    symbols: list of tickers, e.g. ["AAPL", "MSFT"].
    """
    try:
        return build_stock_comparison(symbols)
    except MarketDataError as e:
        return f"Could not compare {', '.join(symbols)}: {e}", None
