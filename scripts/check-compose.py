#!/usr/bin/env python3
"""Validate actual production Compose syntax without secrets, DB or daemon access."""
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='casebridge-compose-check-') as directory:
    env = Path(directory) / 'synthetic.env'
    env.write_text('POSTGRES_PASSWORD=synthetic-compose-check-only\nJWT_SECRET=synthetic-compose-check-only\n')
    config = (root / 'deployment/compose.production.yml').read_text().replace('/etc/casebridge/production.env', str(env))
    subprocess.run(['docker', 'compose', '--project-name', 'cb-config-check', '--env-file', str(env), '-f', '-', 'config', '--quiet'],
                   input=config, text=True, check=True, cwd=root,
                   env={'PATH': os.environ['PATH'], 'HOME': os.environ['HOME'], 'POSTGRES_PASSWORD': 'synthetic-compose-check-only'})
print('Production Compose validated with synthetic configuration only')
