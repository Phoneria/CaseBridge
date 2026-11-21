#!/usr/bin/python3 -I
"""Root-owned manual release entrypoint. Only pinned origin/main artifacts are served.

No caller-supplied paths, compose files, environment variables or shell commands.
Administrators retain emergency access; ordinary release/runtime users cannot edit code.
"""
import argparse
import hashlib
import fcntl
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tarfile
import tempfile
import time
import urllib.request
from html.parser import HTMLParser

REPO = Path('/opt/casebridge')
INVENTORY = Path('/opt/casebridge-releases')
MARKETING = Path('/opt/casebridge-source/web-page')
ENV_FILE = Path('/etc/casebridge/production.env')
LOGS = Path('/var/log/casebridge-release')
ENV = {'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/root', 'LANG': 'C.UTF-8'}
DOCKER = '/usr/bin/docker'
GIT = '/usr/bin/git'


class ReleaseError(Exception):
    pass


def validate_sha(value):
    if not re.fullmatch(r'[0-9a-f]{40}', value):
        raise ReleaseError('A full lowercase main commit is required')
    return value


def safe_relative(name):
    path = PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or not path.parts:
        raise ReleaseError('Invalid artifact path')
    return path


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def verify_files(root, expected):
    for name, wanted in expected.items():
        path = root / str(safe_relative(name))
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(root.resolve()) or digest(path) != wanted:
            raise ReleaseError('Artifact integrity mismatch: ' + name)


def export_source(sha, destination):
    raw = run([GIT, '-C', str(REPO), 'archive', '--format=tar', sha], binary=True)
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        for member in archive.getmembers():
            safe_relative(member.name)
            if not (member.isfile() or member.isdir()):
                raise ReleaseError('Source archive must not contain links/devices')
        archive.extractall(destination, filter='data')


def run(args, *, binary=False, log=None):
    result = subprocess.run(args, env=ENV, stdout=subprocess.PIPE if log is None else log, stderr=subprocess.PIPE if log is None else subprocess.STDOUT)
    if result.returncode:
        # No raw SDK/env/config output is returned to routine operators.
        raise ReleaseError('Command failed: ' + Path(args[0]).name + '; inspect protected release log')
    if log is not None:
        return ''
    return result.stdout if binary else result.stdout.decode().strip()


def write_json(path, value):
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    tmp.chmod(0o644)
    os.replace(tmp, path)


def marketing_files(root):
    files, pending = set(), ['index.html', 'website-version.json', 'gorsel-kaynaklari.html', 'investors.html', 'timeline.html']
    class Links(HTMLParser):
        def handle_starttag(self, tag, attrs):
            data = dict(attrs)
            for key in ('src', 'href', 'poster'):
                value = data.get(key, '').split('?', 1)[0].split('#', 1)[0]
                if value and not value.startswith(('/', 'http:', 'https:', 'data:', 'mailto:')):
                    pending.append(value)
    while pending:
        name = pending.pop()
        safe_relative(name)
        path = root / name
        if name in files or not path.is_file():
            continue
        files.add(name)
        if path.suffix == '.html':
            Links().feed(path.read_text())
        elif path.suffix == '.css':
            for item in re.findall(r'url\([\"\']?([^\"\')]+)', path.read_text()):
                if item.startswith(('data:', 'http:', 'https:', '#')):
                    continue
                target = (path.parent / item.split('?', 1)[0]).resolve()
                if target.is_relative_to(root.resolve()):
                    pending.append(target.relative_to(root.resolve()).as_posix())
    return sorted(files)


def protect_tree(root):
    for path in root.rglob('*'):
        if path.is_symlink():
            raise ReleaseError('Unexpected artifact symlink')
        path.chmod(0o555 if path.is_dir() else (0o555 if path.stat().st_mode & 0o111 else 0o444))
    root.chmod(0o555)


def owned(path):
    info = path.stat()
    if path.is_symlink() or info.st_uid != 0 or info.st_mode & 0o022:
        raise ReleaseError('Release inventory/entrypoint must be root-owned and not writable by operators')


def validate_manifest(manifest, sha):
    if manifest.get('format') != 1 or manifest.get('commit') != sha or manifest.get('scope') not in ('app', 'marketing', 'all') or manifest.get('state') not in ('staged', 'verified'):
        raise ReleaseError('Invalid release manifest identity/state')
    if set(manifest.get('images', {})) != {'cb-backend', 'cb-frontend'} or not all(re.fullmatch(r'sha256:[0-9a-f]{64}', value) for value in manifest['images'].values()):
        raise ReleaseError('Manifest requires immutable image digests')
    for field in ('source_files', 'marketing_files'):
        if not manifest.get(field):
            raise ReleaseError('Missing artifact hashes')
        for name, value in manifest[field].items():
            safe_relative(name)
            if not re.fullmatch(r'[0-9a-f]{64}', value):
                raise ReleaseError('Invalid file digest')
    if not re.fullmatch(r'[0-9]+\.[0-9]+', manifest.get('application_version', '')) or not re.fullmatch(r'v\.[0-9]+\.[0-9]+', manifest.get('marketing_version', '')):
        raise ReleaseError('Invalid version manifest')


def load_release(sha):
    validate_sha(sha)
    root = INVENTORY / sha
    owned(INVENTORY); owned(root); owned(root / 'manifest.json')
    manifest = json.loads((root / 'manifest.json').read_text())
    validate_manifest(manifest, sha)
    verify_files(root / 'source', manifest['source_files'])
    verify_files(root / 'marketing', manifest['marketing_files'])
    for service, image in manifest['images'].items():
        actual = run([DOCKER, 'image', 'inspect', image, '--format', '{{.Id}}'])
        if actual != image:
            raise ReleaseError('Image identity mismatch: ' + service)
    return root, manifest


def source_hashes(root):
    return {p.relative_to(root).as_posix(): digest(p) for p in root.rglob('*') if p.is_file() and not p.is_symlink()}


def compose(root):
    return [DOCKER, 'compose', '--project-name', 'cb-prod', '--env-file', str(ENV_FILE), '-f', str(root / 'source/deployment/compose.production.yml'), '-f', str(root / 'runtime.json')]


def app_assets(image):
    script = "const f=require('fs'),p=require('path'),c=require('crypto'),out={};function walk(d){for(const n of f.readdirSync(d)){const x=p.join(d,n);if(f.statSync(x).isDirectory())walk(x);else if(/\\.(js|css)$/.test(x))out['/_next/'+x.slice('/app/.next/'.length)]=c.createHash('sha256').update(f.readFileSync(x)).digest('hex')}}walk('/app/.next/static');console.log(JSON.stringify(out))"
    return json.loads(run([DOCKER, 'run', '--rm', '--network', 'none', '--read-only', '--entrypoint', 'node', image, '-e', script]))


def runtime_code(image_or_container, service, container=False):
    if service == 'cb-backend':
        binary = 'python'
        script = "import pathlib,hashlib,json;print(json.dumps({str(p.relative_to('/app')):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['/app/app','/app/alembic'] for p in pathlib.Path(folder).rglob('*.py')}))"
    else:
        binary = 'node'
        script = "const f=require('fs'),p=require('path'),c=require('crypto'),out={};function walk(d){if(!f.existsSync(d))return;for(const n of f.readdirSync(d)){const x=p.join(d,n);if(f.statSync(x).isDirectory())walk(x);else out[x.slice(5)]=c.createHash('sha256').update(f.readFileSync(x)).digest('hex')}}walk('/app/.next/server');walk('/app/public');console.log(JSON.stringify(out))"
    args = [DOCKER, 'exec', image_or_container, binary] if container else [DOCKER, 'run', '--rm', '--network', 'none', '--read-only', '--entrypoint', binary, image_or_container]
    return json.loads(run(args + ['-c' if binary == 'python' else '-e', script]))


def canary(images, sha, legacy=False):
    """Actual isolated runtime checks: no production secrets, DB or user records."""
    backend_check = "import os;os.environ.update(DATABASE_URL='sqlite:////tmp/canary.db',JWT_SECRET='synthetic-release-canary',LLM_PROVIDER='mock',CHAT_PROVIDER='mock',ENV='test',STORAGE_DIR='/tmp/storage');import app.models;from app.db.base import Base;from app.db.session import engine;Base.metadata.create_all(engine);from app.main import app;from fastapi.testclient import TestClient;c=TestClient(app);assert c.get('/health').json()['status']=='ok';assert c.get('/legal-lab/cases/missing/scenario-tree').status_code==401;\ntry:open('/app/app/release-write-probe','w');raise AssertionError('Code was writable')\nexcept OSError:pass"
    if legacy:
        backend_check = backend_check.replace(".status_code==401", ".status_code==404")
    hardening = ['--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--tmpfs', '/tmp:rw,nosuid,nodev,size=96m']
    run([DOCKER, 'run', '--rm', '--network', 'none', *hardening, '--entrypoint', 'python', images['cb-backend'], '-c', backend_check])
    name = 'cb-release-canary-' + sha[:12]
    cid = run([DOCKER, 'run', '-d', '-e', 'NEXT_TELEMETRY_DISABLED=1', '--name', name, '--network', 'none', *hardening, '--user', '1000:1000', '--tmpfs', '/app/.next/cache:rw,nosuid,nodev,size=32m,uid=1000,gid=1000', images['cb-frontend'], 'node', 'node_modules/next/dist/bin/next', 'start'])
    try:
        for _ in range(40):
            try:
                check = "fetch('http://127.0.0.1:3000/release.json').then(r=>r.json()).then(x=>console.log(JSON.stringify(x))).catch(()=>process.exit(1))" if not legacy else "fetch('http://127.0.0.1:3000/login').then(r=>console.log(JSON.stringify({ready:r.status===200}))).catch(()=>process.exit(1))"
                raw = run([DOCKER, 'exec', cid, 'node', '-e', check])
                if (json.loads(raw).get('ready') if legacy else json.loads(raw).get('commit') == sha):
                    break
            except (ReleaseError, ValueError, KeyError):
                time.sleep(1)
        else:
            raise ReleaseError('Frontend canary did not become ready')
        run([DOCKER, 'exec', cid, 'node', '-e', "try{require('fs').writeFileSync('/app/package.json','bad');process.exit(1)}catch(e){if(!['EROFS','EACCES'].includes(e.code))process.exit(2)}"])
    finally:
        run([DOCKER, 'rm', '-f', cid])


def runtime_config(images, sha, app_version, backend_identity=None):
    backend_identity = backend_identity or {"commit": sha, "version": app_version}
    security = {'read_only': True, 'cap_drop': ['ALL'], 'security_opt': ['no-new-privileges:true']}
    return {'services': {
        'cb-backend': {**security, 'image': images['cb-backend'], 'pull_policy': 'never',
            'tmpfs': ['/tmp:rw,nosuid,nodev,size=128m'],
            'environment': {'CASEBRIDGE_RELEASE_COMMIT': backend_identity['commit'], 'CASEBRIDGE_APP_VERSION': backend_identity['version'], 'PYTHONDONTWRITEBYTECODE': '1'}},
        'cb-frontend': {**security, 'image': images['cb-frontend'], 'pull_policy': 'never', 'user': '1000:1000',
            'command': ['node', 'node_modules/next/dist/bin/next', 'start'],
            'tmpfs': ['/tmp:rw,nosuid,nodev,size=64m', '/app/.next/cache:rw,nosuid,nodev,size=64m,uid=1000,gid=1000'],
            'environment': {'NEXT_TELEMETRY_DISABLED': '1'}}}}


def stage(sha, scope):
    validate_sha(sha); owned(REPO); owned(REPO / '.git/config')
    remote = run([GIT, '-C', str(REPO), 'remote', 'get-url', 'origin'])
    if remote not in ('https://github.com/Phoneria/CaseBridge.git', 'git@github.com:Phoneria/CaseBridge.git'):
        raise ReleaseError('Unexpected trusted repository')
    run([GIT, '-C', str(REPO), 'fetch', '--quiet', 'origin', 'refs/heads/main:refs/remotes/origin/main'])
    if run([GIT, '-C', str(REPO), 'rev-parse', 'refs/remotes/origin/main']) != sha:
        raise ReleaseError('New artifacts must use the selected current GitHub main commit')
    INVENTORY.mkdir(mode=0o755, parents=True, exist_ok=True); LOGS.mkdir(mode=0o700, parents=True, exist_ok=True)
    owned(INVENTORY); owned(LOGS); owned(ENV_FILE)
    target = INVENTORY / sha
    if target.exists():
        raise ReleaseError('Release already exists; verify or activate the existing artifact')
    work = Path(tempfile.mkdtemp(prefix='.staging-', dir=INVENTORY))
    try:
        source = work / 'source'; source.mkdir(); export_source(sha, source)
        run([DOCKER, 'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '-v', str(source) + ':/workspace:ro', '-w', '/workspace/frontend', 'node:20-slim', 'node', 'scripts/update-version.mjs', '--check'])
        app_version = json.loads((source / 'frontend/app-version.json').read_text())['version']
        marketing_version = json.loads((source / 'web-page/website-version.json').read_text())['version']
        images = {}
        previous = None
        state = INVENTORY / 'current.json'
        if state.exists():
            previous_state = json.loads(state.read_text())
            previous_sha = previous_state.get('application_commit', previous_state['commit'])
            _, previous = load_release(previous_sha)
        hashes = source_hashes(source)
        backend_identity = {'commit': sha, 'version': app_version}
        frontend_commit = sha
        for service, folder in [('cb-backend', 'backend'), ('cb-frontend', 'frontend')]:
            keys = lambda values: {k:v for k,v in values.items() if k.startswith(folder + '/') or k == 'deployment/compose.production.yml'}
            if previous and keys(hashes) == keys(previous['source_files']):
                images[service] = previous['images'][service]
                if service == 'cb-frontend':
                    frontend_commit = previous.get('frontend_commit', previous['commit'])
                if service == 'cb-backend':
                    backend_identity = previous.get('backend_identity', {'commit': previous['commit'], 'version': previous['application_version']})
                continue
            tag = 'casebridge/' + folder + ':' + sha
            args = [DOCKER, 'build', '--label', 'org.opencontainers.image.revision=' + sha, '-t', tag]
            if folder == 'frontend':
                args += ['--build-arg', 'NEXT_PUBLIC_API_URL=https://app.casebridge.com.tr/api', '--build-arg', 'NEXT_PUBLIC_RELEASE_COMMIT=' + sha]
            with (LOGS / (sha + '-' + folder + '-build.log')).open('w') as log:
                run(args + [str(source / folder)], log=log)
            images[service] = run([DOCKER, 'image', 'inspect', tag, '--format', '{{.Id}}'])
        canary(images, frontend_commit)
        static = work / 'marketing'; static.mkdir()
        for name in marketing_files(source / 'web-page'):
            dest = static / name; dest.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(source / 'web-page' / name, dest)
        write_json(static / 'release.json', {'commit': sha, 'version': marketing_version, 'scope': 'marketing'})
        manifest = {'format': 1, 'commit': sha, 'scope': scope, 'state': 'staged', 'application_version': app_version,
            'marketing_version': marketing_version, 'backend_identity': backend_identity, 'frontend_commit': frontend_commit, 'images': images, 'source_files': source_hashes(source), 'marketing_files': source_hashes(static),
            'runtime_code': {service: runtime_code(image, service) for service, image in images.items()}, 'frontend_assets': app_assets(images['cb-frontend']), 'created_at': int(time.time())}
        write_json(work / 'manifest.json', manifest)
        write_json(work / 'runtime.json', runtime_config(images, sha, app_version, backend_identity))
        run(compose(work) + ['config', '--quiet'])
        protect_tree(work); os.replace(work, target)
        print(json.dumps({'commit': sha, 'state': 'staged', 'canary': 'passed', 'scope': scope}))
    except Exception:
        shutil.rmtree(work, ignore_errors=True)
        raise


def fetch(url):
    with urllib.request.urlopen(url, timeout=25) as response:
        if response.status != 200:
            raise ReleaseError('Public HTTP check failed')
        return response.read()


def container_state(name):
    template = '{"id":"{{.Id}}","image":"{{.Image}}","user":"{{.Config.User}}","readonly":{{.HostConfig.ReadonlyRootfs}},"caps":{{json .HostConfig.CapDrop}},"security":{{json .HostConfig.SecurityOpt}},"mounts":{{json .Mounts}}}'
    return json.loads(run([DOCKER, 'inspect', name, '--format', template]))


def verify(sha, quiet=False, allow_unhardened_baseline=False, scope=None):
    root, release = load_release(sha)
    scope = scope or release['scope']
    if scope in ('app', 'all'):
        app = json.loads(fetch('https://app.casebridge.com.tr/release.json')) if not release.get('legacy') else {}
        health = json.loads(fetch('https://app.casebridge.com.tr/api/health'))
        backend_identity = release.get('backend_identity', {'commit': sha, 'version': release['application_version']})
        if health.get('status') != 'ok' or (not release.get('legacy') and (app.get('commit') != release.get('frontend_commit', sha) or app.get('version') != release['application_version'] or health.get('release_commit') != backend_identity['commit'] or health.get('application_version') != backend_identity['version'])):
            raise ReleaseError('Public application release identity mismatch')
        for service, image in release['images'].items():
            state = container_state('cb-prod-' + service + '-1')
            if state['image'] != image or (not allow_unhardened_baseline and (not state['readonly'] or 'ALL' not in (state['caps'] or []) or not any(x.startswith('no-new-privileges') for x in state['security'] or []))):
                raise ReleaseError('Runtime identity/hardening mismatch')
            if not allow_unhardened_baseline and service == 'cb-frontend' and state['user'] not in ('node', '1000', '1000:1000'):
                raise ReleaseError('Frontend must run without root identity')
            if runtime_code('cb-prod-' + service + '-1', service, container=True) != release['runtime_code'][service]:
                raise ReleaseError('Running application code differs from verified image')
            for mount in state['mounts']:
                if mount['RW'] and mount['Destination'] not in ('/app/storage', '/tmp', '/app/.next/cache'):
                    raise ReleaseError('Unexpected writable application mount')
        for path, wanted in release['frontend_assets'].items():
            if hashlib.sha256(fetch('https://app.casebridge.com.tr' + path)).hexdigest() != wanted:
                raise ReleaseError('Served frontend asset mismatch')
    if scope in ('marketing', 'all'):
        marker = json.loads(fetch('https://casebridge.com.tr/release.json'))
        if marker.get('commit') != sha or marker.get('version') != release['marketing_version']:
            raise ReleaseError('Public marketing identity mismatch')
        for path, wanted in release['marketing_files'].items():
            if hashlib.sha256(fetch('https://casebridge.com.tr/' + path)).hexdigest() != wanted:
                raise ReleaseError('Served marketing asset mismatch: ' + path)
    if not quiet:
        print(json.dumps({'commit': sha, 'state': 'verified', 'scope': scope, 'health': 'ok'}))


def _activate(sha, *, rollback=False, scope=None):
    root, release = load_release(sha)
    if rollback and release.get('state') != 'verified':
        raise ReleaseError('Rollback may select only a previously verified main artifact')
    scope = scope or release['scope']
    current_path = INVENTORY / 'current.json'
    previous = json.loads(current_path.read_text()) if current_path.exists() else None
    services = []
    if scope in ('app', 'all'):
        for service, image in release['images'].items():
            state = container_state('cb-prod-' + service + '-1')
            if state['image'] != image or not state['readonly']:
                services.append(service)
    if services:
        with (LOGS / (sha + '-activate.log')).open('w') as log:
            run(compose(root) + ['up', '-d', '--no-build', '--pull', 'never', '--no-deps', '--wait', '--wait-timeout', '120', *services], log=log)
    if scope in ('marketing', 'all'):
        # Caddy's mounted root stays stable; the relative symlink changes inside it.
        public_releases = MARKETING / 'releases'; public_releases.mkdir(mode=0o755, exist_ok=True)
        public = public_releases / sha
        if not public.exists():
            shutil.copytree(root / 'marketing', public); protect_tree(public)
        verify_files(public, release['marketing_files'])
        link = MARKETING / '.current-next'
        if link.is_symlink() or link.exists():
            link.unlink()
        link.symlink_to(Path('releases') / sha)
        os.replace(link, MARKETING / 'current')
    last_error = None
    for _ in range(15):
        try:
            verify(sha, quiet=True, scope=scope); last_error = None; break
        except Exception as error:
            last_error = error; time.sleep(2)
    if last_error:
        # Restore a previously verified artifact once; never recurse indefinitely.
        write_json(LOGS / (sha + '-failed.json'), {'commit': sha, 'previous': previous, 'state': 'verification_failed'})
        raise ReleaseError('Public verification failed; inspect protected recovery record')
    release['state'] = 'verified'
    write_json(root / 'manifest.json', release)
    write_json(current_path, {'commit': sha, 'previous': (previous.get('commit') if previous.get('commit') != sha else previous.get('previous')) if previous else None, 'operation': 'rollback' if rollback else 'activate', 'application_commit': sha if scope in ('app', 'all') else (previous or {}).get('application_commit', (previous or {}).get('commit')), 'marketing_commit': sha if scope in ('marketing', 'all') else (previous or {}).get('marketing_commit', (previous or {}).get('commit')), 'verified_at': int(time.time())})
    print(json.dumps({'commit': sha, 'state': 'verified', 'operation': 'rollback' if rollback else 'activate', 'scope': release['scope']}))


def activate(sha, *, rollback=False, recover=True):
    # Cover compose failures and marketing switches as well as HTTP failures.
    state = INVENTORY / 'current.json'
    previous = json.loads(state.read_text()) if state.exists() else None
    if previous:
        old_app = previous.get('application_commit', previous['commit'])
        old_marketing = previous.get('marketing_commit', previous['commit'])
        initial = previous.get('operation') == 'baseline'
        verify(old_app, quiet=True, scope='app', allow_unhardened_baseline=initial)
        verify(old_marketing, quiet=True, scope='marketing', allow_unhardened_baseline=initial)
    try:
        _activate(sha, rollback=rollback)
    except Exception:
        if recover and previous and previous.get('commit') != sha:
            app = previous.get('application_commit', previous['commit'])
            marketing = previous.get('marketing_commit', previous['commit'])
            if app == marketing:
                _activate(app, rollback=True, scope='all')
            else:
                _activate(app, rollback=True, scope='app')
                _activate(marketing, rollback=True, scope='marketing')
            raise ReleaseError('Release failed; previous verified artifact was restored') from None
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['stage', 'activate', 'verify', 'rollback', 'status'])
    parser.add_argument('commit', nargs='?')
    parser.add_argument('scope', nargs='?', choices=['app', 'marketing', 'all'], default='all')
    args = parser.parse_args()
    os.environ.clear(); os.environ.update(ENV)
    if os.geteuid() != 0:
        raise ReleaseError('Use the root-owned restricted release entrypoint')
    if args.operation == 'status':
        state = INVENTORY / 'current.json'; print(state.read_text() if state.exists() else '{"state":"not_bootstrapped"}')
        return
    INVENTORY.mkdir(mode=0o755, parents=True, exist_ok=True)
    owned(INVENTORY)
    lock = (INVENTORY / '.operation.lock').open('a')
    fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    validate_sha(args.commit or '')
    if args.operation == 'stage': stage(args.commit, args.scope)
    elif args.operation == 'verify': verify(args.commit)
    else: activate(args.commit, rollback=args.operation == 'rollback')


if __name__ == '__main__':
    try:
        main()
    except ReleaseError as error:
        raise SystemExit(str(error)) from None
