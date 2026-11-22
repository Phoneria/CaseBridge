#!/usr/bin/env python3
"""Request real CI only for the exact bounded gallery PR created by this automation."""
import base64
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('gallery',ROOT/'scripts/versioned-gallery.py');gallery=importlib.util.module_from_spec(spec);spec.loader.exec_module(gallery)

def run(*args):return subprocess.check_output(args,cwd=ROOT,text=True).strip()

def eligible(pr,ledger,head,refs):
    if pr['state']!='OPEN' or pr['author']['login'] not in ('app/github-actions','github-actions[bot]') or pr['isCrossRepository'] or pr['baseRefName']!='main' or not pr['headRefName'].startswith('codex/automatic-product-gallery-') or pr['headRefOid']!=head:
        raise ValueError('Not an exact own-bot gallery PR')
    if set(ledger['hashes'])!=set(refs) or any(not re.fullmatch('[0-9a-f]{64}',value) for value in ledger['hashes'].values()):
        raise ValueError('Incomplete gallery ledger')
    fixed={gallery.LEDGER,'web-page/index.html','web-page/website-version.json','scripts/tests/test_generated_gallery.py','specs/changes/generated-gallery.json'}
    allowed=fixed|{'web-page/'+path for path in refs}
    paths={file['path'] for file in pr['files']}
    if not fixed.issubset(paths) or paths-allowed:
        raise ValueError('PR escaped generated gallery allowlist')
    return True

def approve(number,expected_head=None):
    number=str(int(number))
    pr=json.loads(run('gh','pr','view',number,'--json','state,author,isCrossRepository,baseRefName,headRefName,headRefOid,files'))
    head=expected_head or pr['headRefOid']
    content=json.loads(run('gh','api','repos/Phoneria/CaseBridge/contents/'+gallery.LEDGER+'?ref='+head))
    ledger=json.loads(base64.b64decode(content['content']))
    refs=gallery.references((ROOT/'web-page/index.html').read_text())
    eligible(pr,ledger,head,refs)
    runs=json.loads(run('gh','api','repos/Phoneria/CaseBridge/actions/workflows/ci.yml/runs?event=pull_request&head_sha='+head+'&per_page=20'))['workflow_runs']
    approved=[]
    for attempt in runs:
        if attempt['head_sha']==head and attempt['event']=='pull_request' and attempt['path']=='.github/workflows/ci.yml' and attempt['actor']['login']=='github-actions[bot]' and int(number) in [row['number'] for row in attempt['pull_requests']] and attempt['conclusion']=='action_required':
            # Request GitHub's genuine PR workflow; never post a replacement check/status.
            run('gh','api','--method','POST','repos/Phoneria/CaseBridge/actions/runs/'+str(attempt['id'])+'/approve')
            approved.append(attempt['id'])
    print(json.dumps({'pr':int(number),'head':head,'approved_actual_runs':approved}))
    return approved
if __name__=='__main__':approve(sys.argv[1])
