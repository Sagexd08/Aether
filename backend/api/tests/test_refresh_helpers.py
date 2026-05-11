import pytest
from datetime import datetime, timezone
from src.security import create_refresh_token_value, hash_refresh_token, verify_refresh_token_value


def test_create_refresh_token_value_returns_string():
    token = create_refresh_token_value()
    assert isinstance(token, str)
    assert len(token) >= 32


def test_hash_refresh_token_is_deterministic_with_verify():
    token = create_refresh_token_value()
    hashed = hash_refresh_token(token)
    assert verify_refresh_token_value(token, hashed) is True


def test_hash_refresh_token_rejects_wrong_value():
    hashed = hash_refresh_token("correct-token")
    assert verify_refresh_token_value("wrong-token", hashed) is False


def test_hash_refresh_token_not_stored_plain():
    token = "my-secret-token"
    hashed = hash_refresh_token(token)
    assert token not in hashed
