#!/usr/bin/env python3
"""One run on an input nobody prepared, through the API: a plumber nobody has in contacts, with a calendar check
that the simulated calendar cannot satisfy. Expected path: held -> approve once -> dispatched -> ... -> claimed ->
check finds nothing -> re-ask once -> unverified -> confirm by hand. Usage: python3 qa/unprepared.py <base-url>"""
import json
import sys
import urllib.request

base = sys.argv[1].rstrip('/')


def call(path: str, body=None, method=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method or ('POST' if data is not None else 'GET'), headers={'content-type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


task = call('/api/tasks', {
    'text': 'Call Pipe Pros to get a plumber out for the kitchen tap on Friday morning and put the visit in my calendar',
    'counterparty': 'Pipe Pros',
    'amountCents': 0,
    'category': 'call',
    'postcondition': {'kind': 'calendar_event', 'titleContains': 'Pipe Pros', 'startISO': '2026-10-23T09:00:00+01:00', 'windowMinutes': 60},
})['task']
print('created', task['status'], '|', task['decision']['reason'])
assert task['status'] == 'held', 'an unknown counterparty must be held'
task = call(f"/api/tasks/{task['id']}/decide", {'decision': 'approve_once'})['task']
print('after approve once:', task['status'])
for _ in range(30):
    if task['status'] not in ('allowed', 'dispatched', 'working', 'claimed', 'checking'):
        break
    task = call(f"/api/tasks/{task['id']}/poll", {})['task']
print('final:', task['status'], '| reasks:', task['reaskCount'], '|', (task.get('checkResult') or {}).get('reason'))
assert task['status'] == 'unverified', f"expected unverified, got {task['status']}"
assert task['reaskCount'] == 1
task = call(f"/api/tasks/{task['id']}/confirm", {})['task']
print('after manual tick:', task['status'], task['verifiedBy'])
assert task['status'] == 'confirmed_by_user' and task['verifiedBy'] == 'user'
events = call(f"/api/trace/{task['id']}")['events']
kinds = [e['kind'] for e in events]
print('trace kinds:', kinds)
assert kinds[0] == 'decision' and 'user_decision' in kinds and 'reask' in kinds and kinds[-1] == 'manual'
print('unprepared input: PASS')
