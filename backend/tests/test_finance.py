"""Finance tool tests. Alpha Vantage is faked, so no network calls or API key are needed."""

import math

import pytest

from app.tools import finance


def test_sma():
    assert finance.sma([1, 2, 3, 4], 2) == [None, 1.5, 2.5, 3.5]


def test_rsi_all_gains_is_100():
    assert finance.rsi(list(range(1, 30))) == 100.0


def test_max_drawdown():
    assert finance.max_drawdown([100, 120, 90, 130]) == pytest.approx(-0.25)


def test_volatility_of_flat_series_is_zero():
    assert finance.annualized_volatility([10, 10, 10, 10]) == 0


def fake_daily(prices: list[float]) -> dict:
    return {
        "Time Series (Daily)": {
            f"2026-01-{i + 1:02d}": {"4. close": str(p), "5. volume": "1000"} for i, p in enumerate(prices)
        }
    }


@pytest.fixture
def fake_av(monkeypatch):
    data = {
        "AAA": fake_daily([100 + i for i in range(30)]),
        "BBB": fake_daily([100 - i for i in range(30)]),
    }

    def fetch(params):
        if params["symbol"] not in data:
            raise finance.MarketDataError(f"Unknown symbol or bad request: {params['symbol']}")
        return data[params["symbol"]]

    monkeypatch.setattr(finance, "_fetch", fetch)


def test_analyze_stock_returns_text_and_price_chart(fake_av):
    text, chart = finance.build_stock_analysis(" aaa ")

    assert text.startswith("AAA — daily data") and "not financial advice" in text
    assert chart["type"] == "price"
    assert len(chart["dates"]) == 30 and chart["dates"][0] == "2026-01-01"
    assert [s["name"] for s in chart["series"]] == ["Close", "SMA 20", "SMA 50"]
    assert chart["series"][2]["values"] == [None] * 30  # not enough data for SMA 50


def test_compare_rebases_to_zero(fake_av):
    _, chart = finance.build_stock_comparison(["AAA", "bbb", "AAA"])

    assert [s["name"] for s in chart["series"]] == ["AAA", "BBB"]
    assert all(s["values"][0] == 0 for s in chart["series"])
    assert chart["highlight"] == "AAA"
    assert math.isclose(chart["series"][1]["values"][-1], -29.0)


def test_tool_errors_become_text_without_chart(fake_av):
    message = finance.analyze_stock.invoke(
        {"type": "tool_call", "name": "analyze_stock", "args": {"symbol": "NOPE"}, "id": "1"}
    )
    assert "Could not analyze NOPE" in message.content
    assert message.artifact is None
