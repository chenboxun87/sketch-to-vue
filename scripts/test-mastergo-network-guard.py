#!/usr/bin/env python3
"""Regression tests for mastergo_network_guard.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from mastergo_network_guard import (
    assert_https_public_doc_url,
    assert_mastergo_api_endpoint,
    assert_mastergo_short_link,
)

failed = 0


def ok(cond, msg):
    global failed
    if cond:
        print("OK:", msg)
    else:
        print("FAIL:", msg)
        failed += 1


ok(
    assert_mastergo_api_endpoint("https://mastergo.com") == "https://mastergo.com",
    "mastergo API endpoint",
)
try:
    assert_mastergo_api_endpoint("https://evil.com")
    ok(False, "reject evil API host")
except ValueError:
    ok(True, "reject evil API host")

try:
    assert_mastergo_short_link("https://mastergo.com/goto/abc")
    ok(True, "mastergo short link allowed")
except ValueError:
    ok(False, "mastergo short link allowed")
try:
    assert_mastergo_short_link("https://evil.com/goto/x")
    ok(False, "reject evil short link")
except ValueError:
    ok(True, "reject evil short link")

try:
    assert_https_public_doc_url("http://example.com/doc")
    ok(False, "reject http doc")
except ValueError:
    ok(True, "reject http doc")

try:
    assert_https_public_doc_url("https://127.0.0.1/doc")
    ok(False, "reject localhost doc IP")
except ValueError:
    ok(True, "reject localhost doc IP")

try:
    assert_https_public_doc_url("https://localhost/doc")
    ok(False, "reject localhost doc host")
except ValueError:
    ok(True, "reject localhost doc host")

sys.exit(1 if failed else 0)
