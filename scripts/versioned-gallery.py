#!/usr/bin/env python3
"""Prepare and verify a bounded synthetic public-frontend gallery release."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
APP = 'https://app.casebridge.com.tr'
SITE = 'https://casebridge.com.tr'
LEDGER = 'web-page/assets/feature-screens/tr-current/AUTO_CAPTURE.md'


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'Cache-Control': 'no-cache'}), timeout=30) as response:
        return response.read()


def identity():
    app, site = (json.loads(fetch(origin + '/release.json')) for origin in (APP, SITE))
    if not re.fullmatch(r'[0-9a-f]{40}', app['commit']) or not re.fullmatch(r'\d+\.\d+', app['version']) or not re.fullmatch(r'v\.\d+\.\d+', site['version']):
        raise ValueError('Unexpected public identity')
    return {'app': {'version': app['version'], 'commit': app['commit']}, 'marketingVersion': site['version']}


def references(html):
    # Bound extraction to the actual product capabilities, not other screenshot sections.
    match = re.search(r'<div class="capability-screens">(.*?)<dialog id="feature-screen-dialog"', html, re.S)
    if not match:
        raise ValueError('Product capability section missing')
    section = match.group(1)
    result = list(dict.fromkeys(re.findall(r'src="(assets/feature-screens/tr-current/[a-z-]+\.jpg)(?:\?[^"]*)?"', section)))
    if not result or Path(result[0]).stem != 'scenario-tree':
        raise ValueError('Scenario tree must be the first product image')
    return result


def needed(observed, ledger):
    return observed['app'] != ledger.get('app') or observed['marketingVersion'] != ledger.get('marketingVersion')


def next_version(value):
    match = re.fullmatch(r'v\.(\d+)\.(\d+)', value)
    if not match:
        raise ValueError('Expected v. marketing version')
    return f'v.{match[1]}.{int(match[2])+1}'


def validate_batch(paths, batch, audit, expected):
    if audit.get('before') != expected['app'] or audit.get('after') != expected['app'] or audit.get('errors') or audit.get('productionApiRequests') != []:
        raise ValueError('Public capture identity/isolation failure')
    by_name = {row['name']: row for row in audit['audit']}
    if set(by_name) != {Path(path).stem for path in paths} or len(by_name) != len(audit['audit']):
        raise ValueError('Incomplete or duplicate product capture batch')
    hashes = {}
    for path in paths:
        data = (batch/Path(path).name).read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if not data.startswith(b'\xff\xd8\xff') or len(data) < 10000 or by_name[Path(path).stem]['sha256'] != digest:
            raise ValueError('Invalid or corrupt native JPEG')
        hashes[path] = digest
    return hashes


def prepare(root, batch, observed, audit, latest):
    if observed != latest:
        raise ValueError('Public versions changed during capture')
    paths = references((root/'web-page/index.html').read_text())
    hashes = validate_batch(paths, batch, audit, observed)
    app_version_file = root/'frontend/app-version.json'
    if app_version_file.exists() and json.loads(app_version_file.read_text())['version'] != observed['app']['version']:
        raise ValueError('Main application source has not reached public version')
    version_file = root/'web-page/website-version.json'
    version = json.loads(version_file.read_text())
    if version['version'] != observed['marketingVersion']:
        prior = json.loads((root/LEDGER).read_text()) if (root/LEDGER).exists() else {}
        retry_own = prior.get('app') == observed['app'] and prior.get('marketingVersion') == version['version'] and prior.get('sourceMarketingVersion') == observed['marketingVersion']
        if not retry_own:
            raise ValueError('Main marketing source has not reached public version')
    output = next_version(version['version'])
    changed_images = [path for path in paths if not (root/'web-page'/path).exists() or (root/'web-page'/path).read_bytes() != (batch/Path(path).name).read_bytes()]
    # No file changes occur until every candidate has passed validation.
    for path in paths:
        (root/'web-page'/path).write_bytes((batch/Path(path).name).read_bytes())
    old = version['version']; version['version'] = output
    version_file.write_text(json.dumps(version, indent=2)+'\n')
    html = root/'web-page/index.html'
    markup = html.read_text().replace(f'content="{old}"',f'content="{output}"')
    markup = re.sub(r'(assets/feature-screens/tr-current/[a-z-]+\.jpg)(?:\?[^" ]*)?', lambda m: m[1]+'?v='+output.removeprefix('v.'), markup)
    html.write_text(markup)
    ledger = dict(observed, marketingVersion=output, sourceMarketingVersion=observed['marketingVersion'], hashes=hashes,
                  mode='public-served-frontend-with-isolated-synthetic-api', captures=[{key:row[key] for key in ('name','route','viewport','sha256') if key in row} for row in audit['audit']], proxied_request_count=len(audit.get('proxyLog',[])), sourceHash=audit.get('sourceHash'), routes={row['name']:row['route'] for row in audit['audit']})
    (root/LEDGER).write_text(json.dumps(ledger, indent=2, ensure_ascii=False)+'\n')
    # Each generated PR changes a named assertion-bearing acceptance test, binding every output byte.
    test_path = root/'scripts/tests/test_generated_gallery.py'
    test_path.write_text('''import hashlib\nimport json\nfrom pathlib import Path\nimport unittest\n\nclass GeneratedGalleryTests(unittest.TestCase):\n    def test_complete_versioned_gallery_bytes(self):\n        root = Path(__file__).resolve().parents[2]\n        expected = '''+repr(hashes)+'''\n        ledger = json.loads((root/'''+repr(LEDGER)+''').read_text())\n        self.assertEqual(ledger['hashes'], expected)\n        self.assertEqual(json.loads((root/'web-page/website-version.json').read_text())['version'], '''+repr(output)+''')\n        for name, digest in expected.items():\n            self.assertEqual(hashlib.sha256((root/'web-page'/name).read_bytes()).hexdigest(), digest)\n''')
    contract = {'version':1,'changes':[{'files':['web-page/'+path for path in changed_images]+['web-page/index.html','web-page/website-version.json'], 'requirements':['specs/010-versioned-gallery/spec.md#FR-003'], 'acceptance_tests':['scripts/tests/test_generated_gallery.py::GeneratedGalleryTests.test_complete_versioned_gallery_bytes'], 'reason':'Complete atomic native public-frontend capture for both version triggers; synthetic API only.'}]}
    (root/'specs/changes/generated-gallery.json').write_text(json.dumps(contract,indent=2)+'\n')
    return ledger


def verify(root):
    ledger = json.loads((root/LEDGER).read_text())
    current = identity()
    if current['app'] != ledger['app'] or current['marketingVersion'] != ledger['marketingVersion']:
        raise ValueError('Expected gallery version not public yet')
    public_html = fetch(SITE+'/').decode()
    if set(references(public_html)) != set(ledger['hashes']):
        raise ValueError('Public product references differ')
    for path,digest in ledger['hashes'].items():
        if path+'?v='+ledger['marketingVersion'].removeprefix('v.') not in public_html:
            raise ValueError('Public gallery cache identity missing: '+path)
        if hashlib.sha256(fetch(SITE+'/'+path+'?v='+ledger['marketingVersion'].removeprefix('v.'))).hexdigest() != digest:
            raise ValueError('Public image bytes differ: '+path)
    if json.loads(fetch(APP+'/api/health'))['status'] != 'ok':
        raise ValueError('Public health failed')
    print('Verified all public gallery bytes, both version identities and health.')


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('action', choices=['detect','prepare','verify']); parser.add_argument('--batch',type=Path); args=parser.parse_args()
    if args.action=='verify':
        verify(ROOT); return
    if args.action=='detect':
        observed=identity()
        ledger=json.loads((ROOT/LEDGER).read_text()) if (ROOT/LEDGER).exists() else {}
        refresh=needed(observed,ledger)
        if ledger and not refresh:
            try: verify(ROOT)
            except (ValueError,OSError): refresh=True
        state=ROOT/'.gallery-observed.json'; state.write_text(json.dumps(observed))
        with open(os.environ.get('GITHUB_OUTPUT','/dev/stdout'),'a') as output:
            output.write('needed='+str(refresh).lower()+'\n')
            output.write('app_commit='+observed['app']['commit']+'\n')
        return
    observed=json.loads((ROOT/'.gallery-observed.json').read_text())
    audit=json.loads((args.batch/'audit.json').read_text())
    prepare(ROOT,args.batch,observed,audit,identity())

if __name__=='__main__': main()
