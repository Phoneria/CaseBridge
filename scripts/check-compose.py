#!/usr/bin/env python3
"""Validate actual production Compose syntax without secrets, DB or daemon access."""
import os
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='casebridge-compose-check-') as directory:
    env = Path(directory) / 'synthetic.env'
    env.write_text('POSTGRES_PASSWORD=synthetic-compose-check-only\nJWT_SECRET=synthetic-compose-check-only\n')
    config = (root / 'deployment/compose.production.yml').read_text().replace('/etc/casebridge/production.env', str(env))
    spec = importlib.util.spec_from_file_location('release', root / 'deployment/release.py')
    release = importlib.util.module_from_spec(spec); spec.loader.exec_module(release)
    runtime = Path(directory) / 'runtime.json'
    runtime.write_text(json.dumps(release.runtime_config({'cb-backend': 'sha256:'+'1'*64, 'cb-frontend':'sha256:'+'2'*64}, 'a'*40, '0.20')))
    subprocess.run(['docker', 'compose', '--project-name', 'cb-config-check', '--env-file', str(env), '-f', '-', '-f', str(runtime), 'config', '--quiet'],
                   input=config, text=True, check=True, cwd=root,
                   env={'PATH': os.environ['PATH'], 'HOME': os.environ['HOME'], 'POSTGRES_PASSWORD': 'synthetic-compose-check-only'})
print('Production Compose and runtime overlay validated with synthetic configuration only')
