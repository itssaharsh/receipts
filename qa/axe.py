#!/usr/bin/env python3
"""Screenshots plus axe-core (WCAG 2.x A/AA, 2.2 AA) over the routes and row states, at 1440 and 390.
Usage: python3 qa/axe.py <base-url>. Writes qa/axe/*.png and prints violations; exit 1 on any violation."""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip('/')
out = Path(__file__).parent / 'axe'
out.mkdir(parents=True, exist_ok=True)
routes = ['/?demo=1', '/connect', '/about'] + [f'/?state={s}' for s in ['verified', 'held', 'working', 'awaiting', 'unverified', 'manual', 'withheld', 'failed', 'empty', 'disconnected', 'nocalendar']]
AXE = 'https://cdn.jsdelivr.net/npm/axe-core@4.10.3/axe.min.js'
TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

total = 0
with sync_playwright() as p:
    browser = p.chromium.launch()
    for w, h in ((1440, 900), (390, 844)):
        ctx = browser.new_context(viewport={'width': w, 'height': h})
        page = ctx.new_page()
        for r in routes:
            name = (r.strip('/').replace('?', '_').replace('=', '-') or 'home') + f'-{w}'
            page.goto(base + r, wait_until='load', timeout=30000)
            page.wait_for_timeout(1500)
            page.screenshot(path=str(out / f'{name}.png'), full_page=True)
            if w != 1440:
                continue
            page.add_script_tag(url=AXE)
            result = page.evaluate("async (tags) => await axe.run(document, { runOnly: { type: 'tag', values: tags } })", TAGS)
            v = result.get('violations', [])
            total += len(v)
            for item in v:
                print(f"{r}: {item['id']} ({item['impact']}) x{len(item['nodes'])}: {item['help']}")
                for n in item['nodes'][:3]:
                    print('    ', n['target'][0] if n['target'] else '', '|', (n.get('failureSummary') or '').split('\n')[1][:120] if n.get('failureSummary') else '')
        ctx.close()
    browser.close()
(out / 'summary.json').write_text(json.dumps({'violations': total}))
print(f'axe: {total} violation(s)')
sys.exit(1 if total else 0)
