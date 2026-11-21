#!/usr/bin/python3 -I
"""One-time, reversible release bootstrap. Keeps existing admin/SSH access intact.

Install this reviewed main file with release.py; inspect --dry-run before execution.
Only the CaseBridge Caddy root changes. No existing user's sudo/SSH rights are removed.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import pwd
import shutil
import stat
import subprocess
import time

spec = importlib.util.spec_from_file_location('casebridge_release', Path(__file__).with_name('release.py'))
r = importlib.util.module_from_spec(spec); spec.loader.exec_module(r)
CADDY = Path('/opt/autosense-b2c/deploy/Caddyfile')
CADDY_CONTAINER = 'autosense-b2c-web-1'


def baseline():
    if (r.INVENTORY / 'current.json').exists():
        return
    if r.run([r.GIT, '-C', str(r.REPO), 'status', '--porcelain']):
        raise r.ReleaseError('Bootstrap requires a clean existing verified checkout')
    sha = r.validate_sha(r.run([r.GIT, '-C', str(r.REPO), 'rev-parse', 'HEAD']))
    r.run([r.GIT, '-C', str(r.REPO), 'merge-base', '--is-ancestor', sha, 'origin/main'])
    r.INVENTORY.mkdir(mode=0o755, parents=True, exist_ok=True)
    r.LOGS.mkdir(mode=0o700, parents=True, exist_ok=True)
    target = r.INVENTORY / sha
    if target.exists():
        raise r.ReleaseError('Incomplete bootstrap artifact exists; administrator must inspect it before retrying')
    target.mkdir(mode=0o755)
    source = target / 'source'; source.mkdir(); r.export_source(sha, source)
    images = {service: r.container_state('cb-prod-' + service + '-1')['image'] for service in ['cb-backend', 'cb-frontend']}
    # The source commit must match the running backend files, not merely a label.
    expected = {p.relative_to(source / 'backend').as_posix(): r.digest(p) for p in (source / 'backend/app').rglob('*.py')}
    code = "import pathlib,hashlib,json;print(json.dumps({str(p.relative_to('/app')):hashlib.sha256(p.read_bytes()).hexdigest() for p in pathlib.Path('/app/app').rglob('*.py')}))"
    actual = json.loads(r.run([r.DOCKER, 'run', '--rm', '--network', 'none', '--read-only', '--entrypoint', 'python', images['cb-backend'], '-c', code]))
    if expected != actual:
        raise r.ReleaseError('Existing backend does not match the baseline main source')
    static = target / 'marketing'; static.mkdir()
    files = r.marketing_files(source / 'web-page')
    for name in files:
        old = r.MARKETING / name
        if not old.is_file() or r.digest(old) != r.digest(source / 'web-page' / name):
            raise r.ReleaseError('Existing marketing differs from baseline main source: ' + name)
        dest = static / name; dest.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(old, dest)
    app_version = json.loads((source / 'frontend/app-version.json').read_text())['version']
    marketing_version = json.loads((source / 'web-page/website-version.json').read_text())['version']
    r.write_json(static / 'release.json', {'commit': sha, 'version': marketing_version, 'scope': 'marketing'})
    manifest = {'format': 1, 'legacy': True, 'commit': sha, 'scope': 'all', 'state': 'verified', 'images': images,
        'application_version': app_version, 'marketing_version': marketing_version, 'runtime_code': {service: r.runtime_code(image, service) for service, image in images.items()},
        'source_files': r.source_hashes(source), 'marketing_files': r.source_hashes(static), 'frontend_assets': r.app_assets(images['cb-frontend'])}
    # Verify the entire old public application bundle before registering it for rollback.
    for path, wanted in manifest['frontend_assets'].items():
        import hashlib
        if hashlib.sha256(r.fetch('https://app.casebridge.com.tr' + path)).hexdigest() != wanted:
            raise r.ReleaseError('Existing public frontend differs from its baseline image')
    r.canary(images, sha, legacy=True)
    r.write_json(target / 'manifest.json', manifest)
    r.write_json(target / 'runtime.json', r.runtime_config(images, sha, app_version))
    r.protect_tree(target)
    public = r.MARKETING / 'releases' / sha; public.parent.mkdir(mode=0o755, exist_ok=True)
    shutil.copytree(static, public); r.protect_tree(public)
    link = r.MARKETING / '.current-next'; link.symlink_to(Path('releases') / sha); os.replace(link, r.MARKETING / 'current')
    original = CADDY.read_bytes(); mode = stat.S_IMODE(CADDY.stat().st_mode)
    import re
    replacement, count = re.subn(rb'(?m)^([ \t]*root[ \t]+\*[ \t]+)/srv/casebridge[ \t]*$', rb'\1/srv/casebridge/current', original)
    if count != 1:
        raise r.ReleaseError('Expected exactly one CaseBridge Caddy root; no config changed')
    backup = Path('/var/backups') / ('casebridge-release-bootstrap-' + str(int(time.time()))); backup.mkdir(mode=0o700)
    saved = backup / 'Caddyfile'; saved.write_bytes(original); saved.chmod(0o600)
    try:
        # Preserve the inode of the shared bind-mounted configuration file.
        CADDY.write_bytes(replacement); CADDY.chmod(mode)
        r.run([r.DOCKER, 'exec', CADDY_CONTAINER, 'caddy', 'validate', '--config', '/etc/caddy/Caddyfile'])
        r.run([r.DOCKER, 'exec', CADDY_CONTAINER, 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile'])
        r.verify(sha, quiet=True, allow_unhardened_baseline=True)
    except Exception:
        CADDY.write_bytes(original); CADDY.chmod(mode)
        r.run([r.DOCKER, 'exec', CADDY_CONTAINER, 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile'])
        raise
    r.write_json(r.INVENTORY / 'current.json', {'commit': sha, 'previous': None, 'operation': 'baseline', 'verified_at': int(time.time())})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--main-commit', help='Reviewed full main SHA containing these exact installer files')
    args = parser.parse_args()
    if args.dry_run:
        print(json.dumps({'new_role': 'cb-release (system, no interactive login)', 'sudo': 'only /usr/local/sbin/casebridge-release',
            'preserve': ['root/izzet administrator access', 'proje-agent rights', 'secrets', 'data volumes', 'other Caddy hosts'],
            'marketing_root': '/srv/casebridge/current', 'runtime': 'read-only code, dropped capabilities, data/cache volumes only', 'deployment_trigger': 'manual; no schedule'}))
        return
    if os.geteuid() != 0:
        raise r.ReleaseError('Bootstrap requires an existing administrator')
    os.environ.clear(); os.environ.update(r.ENV)
    r.owned(Path(__file__)); r.owned(Path(__file__).with_name('release.py'))
    r.run([r.GIT, '-C', str(r.REPO), 'fetch', '--quiet', 'origin', 'refs/heads/main:refs/remotes/origin/main'])
    selected = r.validate_sha(args.main_commit or '')
    if r.run([r.GIT, '-C', str(r.REPO), 'rev-parse', 'origin/main']) != selected:
        raise r.ReleaseError('Installer must match the selected current origin/main commit')
    for name in ['install-release.py', 'release.py']:
        expected = r.run([r.GIT, '-C', str(r.REPO), 'show', selected + ':deployment/' + name], binary=True)
        if expected != Path(__file__).with_name(name).read_bytes():
            raise r.ReleaseError('Installer bytes differ from selected main source')
    baseline()
    try:
        account = pwd.getpwnam('cb-release')
        if account.pw_uid == 0:
            raise r.ReleaseError('Release role must not be root')
    except KeyError:
        r.run(['/usr/sbin/useradd', '--system', '--create-home', '--home-dir', '/var/lib/casebridge-release', '--shell', '/usr/sbin/nologin', 'cb-release'])
    groups = r.run(['/usr/bin/id', '-nG', 'cb-release']).split()
    if any(group in groups for group in ('sudo', 'docker')):
        raise r.ReleaseError('Release role already has broad privileges; review required')
    entry = Path('/usr/local/sbin/casebridge-release'); shutil.copyfile(Path(__file__).with_name('release.py'), entry); entry.chmod(0o555)
    sudoers = Path('/etc/sudoers.d/casebridge-release')
    content = 'Defaults:cb-release env_reset\nDefaults:cb-release secure_path="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"\ncb-release ALL=(root) NOPASSWD: /usr/local/sbin/casebridge-release\n'
    tmp = Path('/etc/sudoers.d/.casebridge-release-new'); tmp.write_text(content); tmp.chmod(0o440)
    r.run(['/usr/sbin/visudo', '-cf', str(tmp)]); os.replace(tmp, sudoers)
    print(json.dumps({'bootstrap': 'verified', 'role': 'cb-release', 'existing_admin_access': 'unchanged', 'automatic_deployment': False}))


if __name__ == '__main__':
    try: main()
    except r.ReleaseError as error: raise SystemExit(str(error)) from None
