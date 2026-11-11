import hashlib
import pytest
from app.large_raster import product_path

def test_raster_parts_integrity_and_cache(tmp_path,monkeypatch):
 root=tmp_path/'source';root.mkdir();runtime=tmp_path/'runtime';monkeypatch.setenv('CACHE_PATH',str(runtime/'cache.sqlite'))
 a=b'part a';b=b'part b';(root/'a').write_bytes(a);(root/'b').write_bytes(b)
 meta={'path':'assembled.tif','sha256':hashlib.sha256(a+b).hexdigest(),'parts':[{'path':k,'sha256':hashlib.sha256(v).hexdigest()} for k,v in [('a',a),('b',b)]]}
 p=product_path(root,meta);assert p.read_bytes()==a+b;assert product_path(root,meta)==p
 p.write_bytes(b'corrupted');
 with pytest.raises(ValueError):product_path(root,meta)

def test_raster_parts_reject_corruption_and_incomplete_output(tmp_path,monkeypatch):
 monkeypatch.setenv('CACHE_PATH',str(tmp_path/'cache'/'x.sqlite'))
 (tmp_path/'a').write_bytes(b'wrong')
 meta={'path':'missing.tif','sha256':'0'*64,'parts':[{'path':'a','sha256':hashlib.sha256(b'expected').hexdigest()}]}
 with pytest.raises(ValueError):product_path(tmp_path,meta)
 assert not list((tmp_path/'cache').glob('*.assembling'))
