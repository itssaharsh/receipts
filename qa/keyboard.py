#!/usr/bin/env python3
"""Keyboard-only path: Tab to the compose field, type, Tab to Send, Enter; the focus ring is visible on each stop.
Usage: python3 qa/keyboard.py <base-url>. Exit 1 on a missing focus ring or a dead stop."""
import sys

from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip('/')
problems: list[str] = []

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_context(viewport={'width': 1440, 'height': 900}).new_page()
    page.goto(base + '/?state=verified', wait_until='load')
    page.wait_for_timeout(1000)
    seen: list[str] = []
    for _ in range(14):
        page.keyboard.press('Tab')
        info = page.evaluate(
            """() => { const el = document.activeElement; if (!el || el === document.body) return null;
               const cs = getComputedStyle(el); const fv = el.matches(':focus-visible');
               return { tag: el.tagName, text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 40), outline: cs.outlineStyle, fv }; }"""
        )
        if not info:
            problems.append('focus left the page')
            break
        seen.append(f"{info['tag']}:{info['text']}")
        if info['fv'] and info['outline'] == 'none':
            problems.append(f"no visible focus ring on {info['tag']} '{info['text']}'")
    print('tab order:', ' > '.join(seen))
    if not any(s.startswith('INPUT:Ask Fo to') for s in seen):
        problems.append('the compose field is not reachable by Tab within 14 stops')
    if not any('Send to Fo' in s for s in seen):
        problems.append('Send to Fo is not reachable by Tab within 14 stops')
    # Esc closes the trace drawer and focus returns to the opener
    page.get_by_role('button', name='Trace').first.focus()
    page.keyboard.press('Enter')
    page.wait_for_timeout(600)
    if not page.get_by_role('dialog').is_visible():
        problems.append('Enter on Trace did not open the drawer')
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)
    if page.get_by_role('dialog').count() > 0:
        problems.append('Escape did not close the drawer')
    back = page.evaluate("() => (document.activeElement && document.activeElement.innerText || '').trim()")
    if back != 'Trace':
        problems.append(f"focus did not return to the Trace button (now on '{back}')")
    browser.close()

for pr in problems:
    print('PROBLEM', pr)
print('keyboard:', 'PASS' if not problems else 'FAIL')
sys.exit(1 if problems else 0)
