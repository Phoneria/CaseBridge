#!/usr/bin/env python3
"""Publish only the validated generated gallery; no general PR auto-merge authority."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import time

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('gallery',ROOT/'scripts/versioned-gallery.py');gallery=importlib.util.module_from_spec(spec);spec.loader.exec_module(gallery)


def run(*args):
    return subprocess.check_output(args,cwd=ROOT,text=True).strip()


def output_paths(ledger):
    return sorted(['web-page/'+name for name in ledger['hashes']]+['web-page/index.html','web-page/website-version.json',gallery.LEDGER,'scripts/tests/test_generated_gallery.py','specs/changes/generated-gallery.json'])


def required_state(checks, head):
    matching=[check for check in checks if check.get('name')=='spec-governance' and check.get('head_sha')==head and check.get('app',{}).get('id')==15368]
    if not matching: return 'PENDING'
    latest=max(matching,key=lambda check:check['id'])
    if latest.get('status')!='completed': return 'PENDING'
    return (latest.get('conclusion') or 'PENDING').upper()


def head_check_state(head):
    payload=json.loads(run('gh','api','repos/Phoneria/CaseBridge/commits/'+head+'/check-runs?filter=all&per_page=100'))
    return required_state(payload['check_runs'],head)


def runtime_unchanged(base):
    return subprocess.run(['git','diff','--quiet',base,'origin/main','--','frontend','backend','web-page'],cwd=ROOT).returncode == 0


def main():
    ledger=json.loads((ROOT/gallery.LEDGER).read_text())
    paths=output_paths(ledger)
    run('git','fetch','origin','main')
    base=run('git','rev-parse','HEAD')
    if run('git','rev-parse','origin/main')!=base:
        raise ValueError('Main changed during capture; retry fresh batch next schedule')
    existing=json.loads(run('gh','pr','list','--state','open','--json','number,headRefName,headRefOid,author'))
    for pending in existing:
        if not pending['headRefName'].startswith('codex/automatic-product-gallery-'):
            continue
        if pending['author']['login'] not in ('app/github-actions','github-actions[bot]'):
            raise ValueError('Reserved gallery branch is not owned by the automation')
        failed=head_check_state(pending['headRefOid']) in ('FAILURE','CANCELLED','TIMED_OUT','ACTION_REQUIRED')
        if failed:
            run('gh','pr','close',str(pending['number']),'--delete-branch')
        else:
            raise ValueError('A gallery PR is already pending; retain prior gallery and retry later')
    branch='codex/automatic-product-gallery-'+os.environ['GITHUB_RUN_ID']+'-'+os.environ.get('GITHUB_RUN_ATTEMPT','1')
    run('git','switch','-c',branch)
    run('git','add','--',*paths)
    staged=sorted(run('git','diff','--cached','--name-only').splitlines())
    if set(staged)-set(paths) or not {'web-page/index.html','web-page/website-version.json',gallery.LEDGER,'scripts/tests/test_generated_gallery.py','specs/changes/generated-gallery.json'}.issubset(staged):
        raise ValueError('Generated change escaped allowlist or omitted a captured image')
    run('git','-c','user.name=CaseBridge gallery automation','-c','user.email=gallery@users.noreply.github.com','commit','-m','Refresh complete public product gallery '+ledger['marketingVersion'])
    head=run('git','rev-parse','HEAD')
    run('python3','scripts/check-spec-changes.py','--base',base,'--head',head,'--run')
    run('git','push','origin','HEAD')
    body=Path('/tmp/gallery-pr-body.md')
    body.write_text('Refresh all current product images from the public Turkish frontend '+ledger['app']['version']+' using a disposable synthetic backend. Every browser API request is intercepted; no production account or data is used. Complete JPEG SHA256 and route provenance are committed. The output marketing version ledger suppresses recursive refresh. Required Spec Kit acceptance and immutable automatic marketing publication apply.\n')
    url=run('gh','pr','create','--head',branch,'--base','main','--title','Automatic product gallery '+ledger['marketingVersion'],'--body-file',str(body))
    # Token-created PR events are suppressed by GitHub; dispatch real required Actions CI explicitly.
    run('gh','workflow','run','ci.yml','--ref',branch,'-f','base='+base)
    approval_spec=importlib.util.spec_from_file_location('own_ci_approval',ROOT/'scripts/approve-gallery-ci.py')
    approval=importlib.util.module_from_spec(approval_spec);approval_spec.loader.exec_module(approval)
    checks_deadline=time.monotonic()+300
    while time.monotonic()<checks_deadline:
        approval.approve(url.rstrip('/').split('/')[-1],head)
        state=head_check_state(head)
        if state=='SUCCESS': break
        if state in ('FAILURE','CANCELLED','TIMED_OUT','ACTION_REQUIRED'):
            run('gh','pr','close',url,'--delete-branch')
            raise ValueError('Required gallery acceptance failed; next schedule retries cleanly')
        time.sleep(5)
    else:
        run('gh','pr','close',url,'--delete-branch')
        raise ValueError('Required gallery acceptance timed out; next schedule retries cleanly')
    expected={'app':ledger['app'],'marketingVersion':ledger['sourceMarketingVersion']}
    run('git','fetch','origin','main')
    if gallery.identity()!=expected or not runtime_unchanged(base):
        run('gh','pr','close',url,'--delete-branch')
        raise ValueError('Public versions changed while candidate CI ran; retry current source')
    run('gh','pr','merge',url,'--auto','--merge','--match-head-commit',head)
    deadline=time.monotonic()+900
    while time.monotonic()<deadline:
        state=json.loads(run('gh','pr','view',url,'--json','state,mergeCommit'))
        if state['state']=='CLOSED': raise ValueError('Generated gallery PR closed without merging')
        if state['state']=='MERGED':
            try:
                gallery.verify(ROOT)
                print('Automatically published and verified '+url);return
            except (ValueError,OSError): pass
        time.sleep(15)
    raise ValueError('Public byte verification not complete; next schedule recovers without replacing old gallery')

if __name__=='__main__': main()
