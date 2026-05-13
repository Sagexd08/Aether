import pytest
from src.services.dataset_ingestion import compute_quality_signals


def test_null_rates_computed_correctly():
    rows = [
        {'text': 'hello', 'label': 'pos'},
        {'text': None, 'label': 'neg'},
        {'text': 'world', 'label': None},
    ]
    result = compute_quality_signals(rows)
    assert abs(result['null_rates']['text'] - 1/3) < 0.01
    assert abs(result['null_rates']['label'] - 1/3) < 0.01


def test_duplicate_estimate():
    rows = [
        {'text': 'hello'},
        {'text': 'hello'},  # duplicate
        {'text': 'world'},
    ]
    result = compute_quality_signals(rows)
    assert result['duplicate_estimate'] > 0


def test_empty_rows_returns_safe_defaults():
    result = compute_quality_signals([])
    assert result['null_rates'] == {}
    assert result['duplicate_estimate'] == 0.0
    assert result['sample_count'] == 0


def test_language_detection_on_english_text():
    rows = [{'text': 'The quick brown fox jumps over the lazy dog'}]
    result = compute_quality_signals(rows)
    assert result['language'] in ('en', 'unknown')
    assert 0.0 <= result['language_confidence'] <= 1.0
