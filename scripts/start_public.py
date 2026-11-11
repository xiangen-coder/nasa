"""Run the local scientific API and public Next server as one preview service."""
import os
import signal
import subprocess
import sys
import time
import urllib.request

children = []
stopping = False

def stop(signum=None, frame=None):
    global stopping
    stopping = True
    for child in children:
        if child.poll() is None:
            child.terminate()

signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
exit_code = 1
try:
    children.append(subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--app-dir", "/app/backend", "--host", "127.0.0.1", "--port", "8000"], cwd="/app"))
    deadline = time.monotonic() + 180
    while not stopping:
        if children[0].poll() is not None:
            raise RuntimeError("Scientific API exited before readiness")
        try:
            with urllib.request.urlopen("http://127.0.0.1:8000/api/health", timeout=3) as response:
                if response.status == 200:
                    break
        except (OSError, TimeoutError):
            pass
        if time.monotonic() > deadline:
            raise RuntimeError("Scientific API did not become ready")
        time.sleep(1)
    if not stopping:
        env = dict(os.environ, HOSTNAME="0.0.0.0")
        children.append(subprocess.Popen(["node", "server.js"], cwd="/app/frontend", env=env))
        while not stopping:
            for child in children:
                code = child.poll()
                if code is not None:
                    raise RuntimeError(f"Service process exited with status {code}")
            time.sleep(0.5)
    exit_code = 0
finally:
    stop()
    deadline = time.monotonic() + 20
    for child in children:
        try:
            child.wait(timeout=max(0.1, deadline-time.monotonic()))
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()
sys.exit(exit_code)
