#!/usr/bin/env python3
"""
MasterGo DSL Fetcher
"""

import json
import os
import ssl
import sys
from typing import Dict, Optional, Tuple
from urllib.parse import urlparse, parse_qs
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from mastergo_network_guard import (
    ALLOWED_API_HOSTS,
    assert_https_public_doc_url,
    assert_mastergo_api_endpoint,
    assert_mastergo_short_link,
)

DEFAULT_ENDPOINT = "https://mastergo.com"
REQUEST_TIMEOUT = 30


def get_token() -> str:
    return os.environ.get("MASTERGO_TOKEN", "")


def get_endpoint() -> str:
    url = os.environ.get("MASTERGO_ENDPOINT", DEFAULT_ENDPOINT)
    return assert_mastergo_api_endpoint(url)


def parse_mastergo_url(url: str) -> Optional[Dict[str, str]]:
    try:
        parsed = urlparse(url)
        file_id = next((s for s in parsed.path.split("/") if s.isdigit()), None)
        layer_id = parse_qs(parsed.query).get("layer_id", [None])[0]
        if file_id and layer_id:
            return {"fileId": file_id, "layerId": layer_id}
        return None
    except Exception:
        return None


def is_short_link(url: str) -> bool:
    return "/goto/" in url


def resolve_short_link(url: str) -> str:
    assert_mastergo_short_link(url)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = Request(url, method="GET")
    req.add_header("User-Agent", "MasterGo-DSL-Tool/1.0")

    try:
        with urlopen(req, timeout=REQUEST_TIMEOUT, context=ctx) as resp:
            return resp.url
    except HTTPError as e:
        if 300 <= e.code < 400:
            location = e.headers.get("Location")
            if location:
                return location
        raise ValueError(f"Failed to resolve short link: HTTP {e.code}")


def extract_ids_from_url(url: str) -> Tuple[str, str]:
    parsed = urlparse(url)
    if is_short_link(url):
        assert_mastergo_short_link(url)
    elif parsed.hostname:
        host = parsed.hostname.lower()
        if host not in ALLOWED_API_HOSTS:
            raise ValueError(f"MasterGo URL host not allowed: {host!r}")
    target_url = resolve_short_link(url) if is_short_link(url) else url
    result = parse_mastergo_url(target_url)
    if not result:
        raise ValueError(f"Cannot extract fileId or layerId from URL: {target_url}")
    return result["fileId"], result["layerId"]


def extract_component_links(dsl: Dict) -> list:
    links = set()

    def traverse(node):
        if not node or not isinstance(node, dict):
            return
        try:
            link = node.get("componentInfo", {}).get("componentSetDocumentLink", [None])[0]
            if link:
                links.add(link)
        except (TypeError, IndexError, AttributeError):
            pass
        for child in node.get("children", []):
            traverse(child)

    for node in dsl.get("nodes", []):
        traverse(node)

    return list(links)


def build_dsl_rules() -> list:
    rules = [
        "token field must be generated as a variable (colors, shadows, fonts, etc.) and the token field must be displayed in the comment",
        "componentDocumentLinks is a list of frontend component documentation links used in the DSL layer, designed to help you understand how to use the components. When it exists and is not empty, you need to fetch all component documentation content, understand component usage, and generate code using the components.",
    ]

    env_rules = os.environ.get("RULES", "[]")
    try:
        extra_rules = json.loads(env_rules)
        if isinstance(extra_rules, list):
            rules.extend(extra_rules)
    except json.JSONDecodeError:
        pass

    return rules


def get_dsl(file_id: str, layer_id: str, token: str = None, endpoint: str = None) -> Dict:
    token = token or get_token()
    endpoint = endpoint or get_endpoint()

    if not token:
        raise ValueError("MASTERGO_TOKEN env var is required but not set")

    api_url = f"{endpoint}/mcp/dsl?fileId={file_id}&layerId={layer_id}"
    req = Request(api_url, method="GET")
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    req.add_header("X-MG-UserAccessToken", token)

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    try:
        with urlopen(req, timeout=REQUEST_TIMEOUT, context=ctx) as resp:
            dsl_data = json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        error_body = e.read().decode("utf-8") if e.fp else str(e)
        raise ValueError(f"API request failed: HTTP {e.code} - {error_body}")
    except URLError as e:
        raise ValueError(f"Network error: {e.reason}")

    component_links = extract_component_links(dsl_data)
    return {"dsl": dsl_data, "componentDocumentLinks": component_links, "rules": build_dsl_rules()}


def get_dsl_from_url(url: str, token: str = None, endpoint: str = None) -> Dict:
    file_id, layer_id = extract_ids_from_url(url)
    return get_dsl(file_id, layer_id, token, endpoint)


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Fetch DSL data from MasterGo")
    parser.add_argument("url", nargs="?", help="MasterGo URL or short link")
    parser.add_argument("--file-id", "-f", help="File ID")
    parser.add_argument("--layer-id", "-l", help="Layer ID")
    parser.add_argument("--token", "-t", help="API Token (defaults to MASTERGO_TOKEN)")
    parser.add_argument("--endpoint", "-e", help="API endpoint (defaults to MASTERGO_ENDPOINT)")
    parser.add_argument("--pretty", "-p", action="store_true", help="Pretty print JSON output")
    args = parser.parse_args()

    try:
        if args.url:
            result = get_dsl_from_url(args.url, args.token, args.endpoint)
        elif args.file_id and args.layer_id:
            result = get_dsl(args.file_id, args.layer_id, args.token, args.endpoint)
        else:
            parser.error("Please provide URL or --file-id and --layer-id")

        print(json.dumps(result, ensure_ascii=False, indent=2 if args.pretty else None))
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        sys.exit(130)


if __name__ == "__main__":
    main()
