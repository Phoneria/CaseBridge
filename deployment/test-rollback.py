#!/usr/bin/python3 -I
"""Run old -> new -> old images in isolated canaries, never production services."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('release.py'))
r = importlib.util.module_from_spec(spec); spec.loader.exec_module(r)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('previous'); parser.add_argument('candidate'); args = parser.parse_args()
    if os.geteuid() != 0: raise SystemExit('Run reviewed main test with an existing administrator')
    r.owned(Path(__file__)); r.owned(Path(__file__).with_name('release.py'))
    os.environ.clear(); os.environ.update(r.ENV)
    checked = []
    for sha in [args.previous, args.candidate, args.previous]:
        _, manifest = r.load_release(sha)
        r.canary(manifest['images'], manifest.get('frontend_commit', sha), legacy=manifest.get('legacy', False))
        checked.append({'commit': sha, 'synthetic_health': 'ok', 'frontend_http': 'ok', 'readonly_code': 'verified'})
    print(json.dumps({'isolated_rollback_cycle': checked, 'production_services_modified': False}))
