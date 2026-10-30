"""Exercise a running stack through its frontend API proxy, without external requests."""
import json
import sys
import urllib.request

base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3000'

def call(path, body=None):
    request = urllib.request.Request(base+'/api/'+path, data=json.dumps(body).encode() if body else None, headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()

assert json.loads(call('health'))['status'] == 'ok'
sites = json.loads(call('sites'))
mission = {**sites[0], 'start':'2026-10-01T00:00:00Z', 'end':'2026-10-08T00:00:00Z', 'interval_minutes':60, 'clearance_deg':0}
result = json.loads(call('analyze', mission))
assert len(result['series']) == 169
assert result['provenance']['ephemeris'] == 'NASA/JPL DE421'
assert 0 <= result['metrics']['simultaneous_pct'] <= 100
comparison = json.loads(call('compare', {'mission':mission, 'locations':sites}))
assert len(comparison['ranking']) == 3
export = call('export', {'mission':mission, 'format':'csv'}).decode()
assert len(export.splitlines()) == 170
assert 'sun_azimuth' in export and result['mode'] in export
print(f"Stack smoke passed: 169 ephemeris samples, 3 compared sites, 169 CSV data rows; mode={result['mode']}")
