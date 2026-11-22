#!/usr/bin/python3 -I
"""Classify a protected-main change and publish eligible UI artifacts."""
import fcntl
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import time

ASSETS = {'.png', '.jpg', '.jpeg', '.svg', '.webp', '.avif', '.gif', '.ico', '.woff', '.woff2', '.mp4'}
APP_VERSION = 'frontend/app-version.json'
SITE_VERSION = 'web-page/website-version.json'


def classification(paths):
    scopes = set()
    for name in paths:
        path = PurePosixPath(name)
        if name in (APP_VERSION, SITE_VERSION, 'todo.md') or name.startswith(('docs/', 'specs/', 'scripts/tests/', 'tests/')):
            continue
        if name.startswith('frontend/src/') and ('__tests__' in path.parts or re.search(r'\.(test|spec)\.[jt]sx?$', name)):
            continue
        if name.startswith('frontend/src/') and path.suffix == '.css':
            scopes.add('app')
        elif name.startswith('frontend/src/components/') and path.suffix == '.tsx':
            scopes.add('app')
        elif name.startswith('frontend/public/') and path.suffix.lower() in ASSETS:
            scopes.add('app')
        elif name.startswith('web-page/') and path.suffix.lower() in ASSETS | {'.css', '.html', '.js'}:
            scopes.add('marketing')
        elif name.startswith('web-page/assets/') and path.suffix == '.md':
            continue
        else:
            return 'standard'
    return 'all' if len(scopes) == 2 else next(iter(scopes), 'none')


def git_paths(repo, base, head):
    # No rename inference: both the old and new path must pass the allowlist.
    raw = subprocess.check_output(['/usr/bin/git', '-C', str(repo), 'diff', '--no-renames', '--name-only', '-z', base, head])
    return [os.fsdecode(n) for n in raw.split(b'\0') if n]


def version(value):
    if not re.fullmatch(r'v?\d+\.\d+', value):
        raise ValueError('Unsupported release version')
    return tuple(map(int, value.lstrip('v').split('.')))


def pull(r):
    r.owned(r.REPO)
    r.owned(r.REPO / '.git/config')
    git = [r.GIT, '-C', str(r.REPO)]
    if r.run(git + ['remote', 'get-url', 'origin']) not in ('https://github.com/Phoneria/CaseBridge.git', 'git@github.com:Phoneria/CaseBridge.git'):
        raise r.ReleaseError('Unexpected repository')
    r.run(git + ['fetch', '--quiet', 'origin', 'refs/heads/main:refs/remotes/origin/main'])
    return r.validate_sha(r.run(git + ['rev-parse', 'refs/remotes/origin/main']))


def publish(r):
    journal = r.INVENTORY / 'auto-ui.json'
    r.owned(journal)
    saved = json.loads(journal.read_text())
    base = r.validate_sha(saved['baseline'])
    head = pull(r)
    if head == base or head == saved.get('attempt'):
        return
    current = json.loads((r.INVENTORY / 'current.json').read_text())
    if current['operation'] == 'rollback':
        print('Paused after operator rollback; standard release required.')
        return
    # A verified manual all-scope deployment may have superseded our baseline.
    app, site = current['application_commit'], current['marketing_commit']
    if app == site and app != base:
        is_newer = subprocess.run([r.GIT, '-C', str(r.REPO), 'merge-base', '--is-ancestor', base, app]).returncode == 0
        if is_newer:
            base = app
    git = [r.GIT, '-C', str(r.REPO)]
    r.run(git + ['merge-base', '--is-ancestor', base, head])
    paths = git_paths(r.REPO, base, head)
    scope = classification(paths)
    if scope == 'none':
        r.write_json(journal, {'baseline': head})
        return
    if scope == 'standard':
        return  # Never advance past unshipped mixed changes.
    for file, target, field in [(APP_VERSION, app, 'app'), (SITE_VERSION, site, 'marketing')]:
        if scope in (field, 'all'):
            read = lambda sha: version(json.loads(r.run(git + ['show', sha + ':' + file]))['version'])
            if read(head) <= read(target):
                raise r.ReleaseError('UI release needs a version increment')
    started = int(time.time())
    print(f'Automatic UI release: {head} {scope}', flush=True)
    # Latch failures and interrupted attempts: never repeatedly activate a bad artifact.
    r.write_json(journal, {'baseline': base, 'attempt': head, 'started': started})
    if not (r.INVENTORY / head).exists():
        r.stage(head, scope)
    _, staged = r.load_release(head)
    _, previous = r.load_release(app)
    if staged['scope'] != scope or staged['images']['cb-backend'] != previous['images']['cb-backend']:
        raise r.ReleaseError('Artifact scope or backend image changed')
    if pull(r) != head:
        print('New main tip arrived while building; leaving current release in place.')
        return
    r.activate(head)
    r.verify(head, scope=scope)
    r.write_json(journal, {'baseline': head, 'last_auto': head, 'scope': scope, 'started': started, 'finished': int(time.time())})


def main():
    if len(sys.argv) == 4 and sys.argv[1] == 'classify':
        if not all(re.fullmatch(r'[0-9a-f]{40}', arg) for arg in sys.argv[2:]):
            raise SystemExit('Expected full git revisions')
        print(classification(git_paths(Path.cwd(), *sys.argv[2:])))
        return
    if len(sys.argv) != 1 or os.geteuid() != 0:
        raise SystemExit('Installed automatic publisher takes no arguments')
    from importlib.machinery import SourceFileLoader
    from importlib.util import module_from_spec, spec_from_loader
    loader = SourceFileLoader('casebridge_trusted_release', '/usr/local/sbin/casebridge-release')
    r = module_from_spec(spec_from_loader(loader.name, loader))
    loader.exec_module(r)
    os.environ.clear()
    os.environ.update(r.ENV)
    os.umask(0o022)
    with (r.INVENTORY / '.operation.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        publish(r)


if __name__ == '__main__':
    main()
