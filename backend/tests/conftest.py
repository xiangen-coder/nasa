import os
import sys
from pathlib import Path
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ['CACHE_PATH'] = '/tmp/lunar-navigator-tests.sqlite'

@pytest.fixture
def mission():
    from app.models import Mission
    return Mission(latitude=-89.54, longitude=0, start='2026-10-01T00:00:00Z', end='2026-10-02T00:00:00Z', interval_minutes=60)

@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        yield c
