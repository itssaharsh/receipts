#!/usr/bin/env python3
"""Records a scripted take of the demo (J1 verified, J2 held then approved with a rule, J2 held then declined, the trace).
Usage: python3 qa/take.py <base-url> <out-dir> [label]. Resets the ledger first (POST /api/demo/reset)."""
import shutil
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip('/')
out = Path(sys.argv[2])
label = sys.argv[3] if len(sys.argv) > 3 else 'take'
out.mkdir(parents=True, exist_ok=True)
stamp = time.strftime('%Y%m%d-%H%M%S')

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, record_video_dir=str(out), record_video_size={'width': 1440, 'height': 900})
    page = ctx.new_page()
    page.request.post(base + '/api/demo/reset')
    page.goto(base + '/?record=1', wait_until='load')
    page.wait_for_timeout(2500)
    # the compose details exist twice (a desktop block and a phone disclosure); use the visible desktop one
    form = page.locator('form[aria-label="Ask Fo"]')
    details = form.locator('div.hidden.sm\\:block')

    def field(label: str):
        return details.get_by_label(label)

    # J1: the dentist booking, allowed by R1, verified from the calendar
    page.get_by_role('button', name='Fill the demo task').click()
    page.wait_for_timeout(1200)
    page.get_by_role('button', name='Send to Fo').click()
    page.locator('li[data-status="verified"]').first.wait_for(timeout=90000)
    page.wait_for_timeout(3000)

    # J2a: a new counterparty, held by R1, approved with a rule
    form.get_by_label('Ask Fo to…').fill('Email my new landlord Jordan Lee that the rent will be late')
    field('Who it involves').select_option('__other')
    field('Their name').fill('Jordan Lee')
    field('Kind').select_option('email')
    field('Check').select_option('none')
    page.wait_for_timeout(800)
    page.get_by_role('button', name='Send to Fo').click()
    page.get_by_role('button', name='Approve and add a rule').wait_for(timeout=15000)
    page.wait_for_timeout(2500)
    page.get_by_role('button', name='Approve and add a rule').click()
    page.locator('li[data-status="dispatched"], li[data-status="working"], li[data-status="verified"], li[data-status="unverified"]').first.wait_for(timeout=15000)
    page.wait_for_timeout(2000)

    # J2b: over the cap, held by R2, declined
    form.get_by_label('Ask Fo to…').fill('Order flowers for $45 to Mum')
    field('Who it involves').select_option('Mum')
    field('Amount, if any').fill('45')
    field('Kind').select_option('purchase')
    field('Check').select_option('none')
    page.wait_for_timeout(800)
    page.get_by_role('button', name='Send to Fo').click()
    page.get_by_role('button', name='Decline').wait_for(timeout=15000)
    page.wait_for_timeout(2500)
    page.get_by_role('button', name='Decline').click()
    page.locator('li[data-status="withheld"]').first.wait_for(timeout=15000)
    page.wait_for_timeout(2000)

    # J3: the trace of the verified receipt, then the run count
    page.locator('li[data-status="verified"]').first.get_by_role('button', name='Trace').click()
    page.get_by_text('check:calendar_event_exists').first.wait_for(timeout=15000)
    page.wait_for_timeout(5000)
    page.keyboard.press('Escape')
    page.wait_for_timeout(1500)
    page.screenshot(path=str(out / f'{label}-{stamp}-end.png'))
    video = page.video
    ctx.close()
    browser.close()
    if video:
        src = Path(video.path())
        dst = out / f'{label}-{stamp}.webm'
        shutil.move(str(src), str(dst))
        print('video', dst, dst.stat().st_size, 'bytes')
