"""Verify kernels and produce reproducible, genuinely computed three-site examples."""
import json
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'backend'))
from app.main import analyze, ROOT
from app.models import Mission
from app.sites import SITES

# Ship consistent, portable reference-sphere examples even if a local DEM is configured.
os.environ.pop("LOLA_MANIFEST", None)

for site in SITES:
    result = analyze(Mission(**{k:site[k] for k in ['name','latitude','longitude']}, start='2026-10-01T00:00:00Z', end='2026-10-08T00:00:00Z', interval_minutes=60))
    path = ROOT/'data/examples'/f"{site['id']}.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(result, indent=2))
    print(site['id'], result['mode'], result['metrics']['simultaneous_pct'])

import shutil
public = ROOT/'frontend/public'
(public/'examples').mkdir(parents=True, exist_ok=True)
(public/'sites.json').write_text(json.dumps(SITES, indent=2)+'\n')
for path in (ROOT/'data/examples').glob('*.json'):
    shutil.copyfile(path, public/'examples'/path.name)
