"""
MasterGo 相关脚本的出站 URL 安全校验（SSRF / 域限制）。
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

ALLOWED_API_HOSTS = frozenset(
    {
        "mastergo.com",
        "www.mastergo.com",
    }
)

BLOCKED_DOC_HOSTS = frozenset(
    {
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "metadata.google.internal",
    }
)


def _hostname_blocked(hostname: str) -> bool:
    h = (hostname or "").lower().strip(".")
    if not h:
        return True
    if h in BLOCKED_DOC_HOSTS:
        return True
    if h.endswith(".local") or h.endswith(".internal"):
        return True
    return False


def _ip_blocked(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
    )


def assert_mastergo_api_endpoint(endpoint: str) -> str:
    """API 根只允许 mastergo.com（可含路径，主机名必须白名单）。"""
    parsed = urlparse(endpoint if "://" in endpoint else f"https://{endpoint}")
    if parsed.scheme not in ("https", "http"):
        raise ValueError(f"API endpoint must be http(s): {endpoint!r}")
    host = (parsed.hostname or "").lower()
    if host not in ALLOWED_API_HOSTS:
        raise ValueError(
            f"API endpoint host not allowed: {host!r}. "
            f"Allowed: {', '.join(sorted(ALLOWED_API_HOSTS))}"
        )
    return f"{parsed.scheme}://{parsed.netloc}"


def assert_mastergo_short_link(url: str) -> None:
    """短链解析前：必须是 mastergo.com/goto/。"""
    parsed = urlparse(url)
    if parsed.scheme not in ("https", "http"):
        raise ValueError(f"MasterGo URL must be http(s): {url!r}")
    host = (parsed.hostname or "").lower()
    if host not in ALLOWED_API_HOSTS:
        raise ValueError(f"MasterGo short link host not allowed: {host!r}")
    if "/goto/" not in parsed.path:
        raise ValueError(f"Not a MasterGo short link: {url!r}")


def assert_https_public_doc_url(url: str) -> None:
    """
    组件文档 fetch：仅 HTTPS + 非私网/localhost（防 SSRF）。
    允许 DSL 返回的任意公网文档 CDN。
    """
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise ValueError(f"Documentation URL must be https: {url!r}")
    host = parsed.hostname
    if not host:
        raise ValueError(f"Invalid documentation URL: {url!r}")
    if _hostname_blocked(host.lower()):
        raise ValueError(f"Documentation host blocked: {host!r}")
    # 字面 IP
    if _ip_blocked(host):
        raise ValueError(f"Documentation IP blocked: {host!r}")
    # 解析后 IP（DNS rebinding 基础防护）
    try:
        for info in socket.getaddrinfo(host, None):
            addr = info[4][0]
            if _ip_blocked(addr):
                raise ValueError(
                    f"Documentation host resolves to blocked IP {addr!r}: {url!r}"
                )
    except socket.gaierror:
        raise ValueError(f"Cannot resolve documentation host: {host!r}") from None
