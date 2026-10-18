#!/usr/bin/env python3
"""Screenshots of the ledger at 1440x900 and 390x844 for a list of paths. Usage: python3 qa/shots.py <base-url> [paths...]"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip('/')
paths = sys.argv[2:] or ['/?demo=1', '/?state=verified', '/?state=held', '/?state=working', '/?state=unverified', '/?state=withheld', '/?state=empty', '/connect', '/about']
out = Path(__file__).parent / 'shots'
out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch()
    for w, h in ((1440, 900), (390, 844)):
        ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1)
        page = ctx.new_page()
        errors: list[str] = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        for path in paths:
            name = path.strip('/').replace('?', '_').replace('=', '-').replace('&', '_') or 'home'
            try:
                page.goto(base + path, wait_until='load', timeout=30000)
                page.wait_for_timeout(2500)
                page.screenshot(path=str(out / f'{name}-{w}.png'), full_page=False)
                page.screenshot(path=str(out / f'{name}-{w}-full.png'), full_page=True)
                print(f'ok   {path} @{w}')
            except Exception as e:  # noqa: BLE001
                print(f'FAIL {path} @{w}: {e}')
        if errors:
            print(f'console/page errors @{w}:')
            for e in errors[:10]:
                print('   ', e[:200])
        ctx.close()
    browser.close()
