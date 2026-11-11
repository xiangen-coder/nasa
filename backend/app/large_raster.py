"""Assemble immutable large raster parts once into the writable runtime cache."""
import hashlib,os
from pathlib import Path
from threading import RLock
from .science import ROOT
from .terrain import verify
LOCK=RLock()
def product_path(root,meta):
    original=root/meta['path']
    if original.is_file():return original
    if len(meta['sha256'])!=64 or any(c not in '0123456789abcdef' for c in meta['sha256']):raise ValueError('Invalid raster checksum.')
    parts=meta.get('parts',[])
    if not parts or len(parts)>50:raise ValueError('Raster file or valid bounded part manifest unavailable.')
    directory=Path(os.getenv('CACHE_PATH',str(ROOT/'data/cache.sqlite'))).parent
    target=directory/('terrain-'+meta['sha256']+'.tif')
    with LOCK:
        directory.mkdir(parents=True,exist_ok=True)
        if target.exists():
            verify(str(target),target.stat().st_mtime_ns,meta['sha256']);return target
        temp=target.with_suffix('.assembling')
        try:
            digest=hashlib.sha256();total=0
            with temp.open('wb') as out:
                for item in parts:
                    p=root/item['path'];verify(str(p),p.stat().st_mtime_ns,item['sha256'])
                    with p.open('rb') as data:
                        while chunk:=data.read(1024*1024):
                            total+=len(chunk)
                            if total>100_000_000:raise ValueError('Assembled raster exceeds 100 MB bound.')
                            digest.update(chunk);out.write(chunk)
            if digest.hexdigest()!=meta['sha256']:raise ValueError('Assembled raster integrity mismatch.')
            temp.replace(target)
        finally:
            if temp.exists():temp.unlink()
    return target
