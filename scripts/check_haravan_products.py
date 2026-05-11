#!/usr/bin/env python3
"""
Check whether a Haravan Private App token can read products.

Usage on PowerShell:
  $env:HARAVAN_ACCESS_TOKEN="your_private_app_access_token"
  python scripts/check_haravan_products.py

Optional:
  $env:HARAVAN_API_KEY="your_private_app_api_key_or_private_token"
  $env:HARAVAN_SHOP="bongbanviet-1.myharavan.com"
  python scripts/check_haravan_products.py --limit 10 --output haravan-products.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


API_BASE = "https://apis.haravan.com/com/products.json"
DEFAULT_SHOP = "bongbanviet-1.myharavan.com"


def fetch_products(access_token: str, limit: int, page: int) -> dict:
    query = urlencode({"limit": limit, "page": page})
    request = Request(
        f"{API_BASE}?{query}",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "bongbanviet-haravan-check/1.0",
        },
        method="GET",
    )

    with urlopen(request, timeout=30) as response:
        body = response.read().decode("utf-8")
        return json.loads(body)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Test Haravan product-list API access for a Private App token."
    )
    parser.add_argument("--limit", type=int, default=5, help="Number of products to fetch.")
    parser.add_argument("--page", type=int, default=1, help="Product page to fetch.")
    parser.add_argument(
        "--output",
        default="haravan-products.json",
        help="Path to save the raw API response JSON.",
    )
    args = parser.parse_args()

    access_token = (
        os.getenv("HARAVAN_ACCESS_TOKEN", "").strip()
        or os.getenv("HARAVAN_API_KEY", "").strip()
    )
    shop = os.getenv("HARAVAN_SHOP", DEFAULT_SHOP).strip()

    if not access_token:
        print("Missing HARAVAN_ACCESS_TOKEN or HARAVAN_API_KEY environment variable.", file=sys.stderr)
        print(
            'PowerShell example: $env:HARAVAN_ACCESS_TOKEN="your_private_app_access_token"',
            file=sys.stderr,
        )
        return 2

    try:
        data = fetch_products(access_token=access_token, limit=args.limit, page=args.page)
    except HTTPError as error:
        error_body = error.read().decode("utf-8", errors="replace")
        print(f"Haravan API request failed: HTTP {error.code}", file=sys.stderr)
        print(error_body, file=sys.stderr)
        return 1
    except URLError as error:
        print(f"Could not connect to Haravan API: {error.reason}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as error:
        print(f"Haravan API returned invalid JSON: {error}", file=sys.stderr)
        return 1

    products = data.get("products")
    if not isinstance(products, list):
        print("Unexpected response: missing 'products' list.", file=sys.stderr)
        print(json.dumps(data, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1

    output_path = Path(args.output)
    output_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"OK: connected to Haravan API for shop hint: {shop}")
    print(f"Fetched {len(products)} product(s). Raw response saved to: {output_path}")

    for index, product in enumerate(products, start=1):
        product_id = product.get("id", "")
        title = product.get("title") or product.get("name") or "(no title)"
        handle = product.get("handle", "")
        variants = product.get("variants") or []
        sku = ""
        if variants and isinstance(variants[0], dict):
            sku = variants[0].get("sku") or ""
        print(f"{index}. id={product_id} title={title} handle={handle} sku={sku}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
