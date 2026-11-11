"""Package native-resolution crops for the small public demo; keep originals offline."""
import hashlib,json
from pathlib import Path
import rasterio
from rasterio.windows import from_bounds,Window
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'data/lunar';output=ROOT/'data/lunar_preview';output.mkdir(exist_ok=True)
manifest=json.loads((source/'manifest.json').read_text())
for kind,meta in manifest['products'].items():
    if kind=='horizon_dem':
        meta['path']=Path(meta['path']).name
        for item in meta.get('parts',[]):item['path']=Path(item['path']).name
        continue
    with rasterio.open(source/meta['path']) as ds:
        # One native 5 m regional crop, and native 240 m thermal coverage of the existing polar points.
        bounds=(-13000,-14000,-9000,-10000) if kind in ('lola','height_uncertainty','slope_uncertainty','sample_count') else (-60000,-60000,60000,60000)
        w=from_bounds(*bounds,ds.transform).round_offsets().round_lengths()
        w=w.intersection(Window(0,0,ds.width,ds.height))
        profile=ds.profile.copy();profile.update(width=int(w.width),height=int(w.height),transform=ds.window_transform(w))
        path=output/meta['path']
        with rasterio.open(path,'w',**profile) as dst:dst.write(ds.read(window=w))
        meta['sha256']=hashlib.sha256(path.read_bytes()).hexdigest()
        meta['coverage_note']='Native-resolution subset for public demo; outside coverage is unavailable. Run prepare_lunar_research.py for full source products.'
        meta['projected_bounds_m']=list(bounds)
        print(kind,path.stat().st_size)
(output/'manifest.json').write_text(json.dumps(manifest,indent=2))
