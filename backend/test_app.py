from app import accuracy


def test_accuracy_metrics():
    result = accuracy([
        {"forecast": 100, "actual": 80},
        {"forecast": 60, "actual": 80},
    ])
    assert result == {"points": 2, "mae": 20.0, "rmse": 20.0, "bias": 0.0, "mape": 25.0}
