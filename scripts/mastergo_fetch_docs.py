#!/usr/bin/env python3
"""
MasterGo Component Documentation Fetcher
"""

import json
import sys
import ssl
import argparse
from typing import List, Dict
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from mastergo_network_guard import assert_https_public_doc_url

REQUEST_TIMEOUT = 30


def fetch_url(url: str) -> str:
    assert_https_public_doc_url(url)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = Request(url, method="GET")
    req.add_header("User-Agent", "MasterGo-DSL-Tool/1.0")
    req.add_header("Accept", "text/plain, text/markdown, text/html, */*")

    try:
        with urlopen(req, timeout=REQUEST_TIMEOUT, context=ctx) as resp:
            return resp.read().decode("utf-8")
    except HTTPError as e:
        raise ValueError(f"HTTP {e.code} fetching {url}")
    except URLError as e:
        raise ValueError(f"Network error fetching {url}: {e.reason}")


def extract_component_links_from_dsl(dsl_data: Dict) -> List[str]:
    if "componentDocumentLinks" in dsl_data:
        return dsl_data["componentDocumentLinks"]

    links = set()
    dsl = dsl_data.get("dsl", dsl_data)

    def traverse(node):
        if not node or not isinstance(node, dict):
            return
        try:
            doc_links = node.get("componentInfo", {}).get("componentSetDocumentLink", [])
            for link in doc_links:
                if link:
                    links.add(link)
        except (TypeError, AttributeError):
            pass
        for child in node.get("children", []):
            traverse(child)

    for node in dsl.get("nodes", []):
        traverse(node)
    if dsl.get("root"):
        traverse(dsl["root"])

    return list(links)


def main():
    parser = argparse.ArgumentParser(description="Fetch component documentation")
    parser.add_argument("urls", nargs="*", help="Documentation URLs to fetch")
    parser.add_argument("--from-dsl", action="store_true", help="Read DSL JSON from stdin and extract component links")
    parser.add_argument("--json", action="store_true", help="Output as JSON object with URL keys")
    args = parser.parse_args()

    urls = list(args.urls)

    if args.from_dsl:
        try:
            dsl_data = json.load(sys.stdin)
            urls.extend(extract_component_links_from_dsl(dsl_data))
        except json.JSONDecodeError as e:
            print(f"Error: Invalid JSON from stdin - {e}", file=sys.stderr)
            sys.exit(1)

    if not urls:
        parser.error("No URLs provided. Use URLs as arguments or --from-dsl")

    seen = set()
    unique_urls = []
    for url in urls:
        if url not in seen:
            seen.add(url)
            unique_urls.append(url)

    results = {}
    errors = []

    for url in unique_urls:
        try:
            results[url] = fetch_url(url)
        except ValueError as e:
            errors.append(str(e))
            results[url] = None

    if args.json:
        output = {"docs": {url: content for url, content in results.items() if content}, "errors": errors if errors else None}
        print(json.dumps(output, ensure_ascii=False, indent=2))
    else:
        for url, content in results.items():
            print("=" * 60)
            print(f"URL: {url}")
            print("=" * 60)
            print(content if content else "[FETCH FAILED]")
            print()

    if errors:
        for err in errors:
            print(f"Warning: {err}", file=sys.stderr)
        sys.exit(1 if not results else 0)


if __name__ == "__main__":
    main()
