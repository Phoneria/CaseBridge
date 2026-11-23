import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('gallery',ROOT/'scripts/versioned-gallery.py')
gallery=importlib.util.module_from_spec(spec);spec.loader.exec_module(gallery)

class VersionedGalleryTests(unittest.TestCase):
    def test_both_version_triggers_and_self_generated_release_suppression(self):
        current={'app':{'version':'0.23','commit':'a'*40},'marketingVersion':'v.0.47'}
        self.assertTrue(gallery.needed(current,{}))
        self.assertFalse(gallery.needed(current,current))
        self.assertTrue(gallery.needed(dict(current,app={'version':'0.24','commit':'b'*40}),current))
        self.assertTrue(gallery.needed(dict(current,marketingVersion='v.0.48'),current))
        output=dict(current,marketingVersion=gallery.next_version(current['marketingVersion']))
        self.assertFalse(gallery.needed(output,output))
        self.assertEqual(output['marketingVersion'],'v.0.48')

    def test_missing_corrupt_and_source_race_batches_cannot_change_prior_gallery(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'web-page').mkdir();(root/'web-page/index.html').write_text('<div class="capability-screens"><img src="assets/feature-screens/tr-current/scenario-tree.jpg"><img src="assets/feature-screens/tr-current/analysis.jpg"><dialog id="feature-screen-dialog">')
            (root/'web-page/website-version.json').write_text('{"version":"v.0.47"}')
            batch=root/'batch';batch.mkdir();(batch/'scenario-tree.jpg').write_bytes(b'\xff\xd8\xff'+b'j'*10000)
            observed={'app':{'version':'0.23','commit':'a'*40},'marketingVersion':'v.0.47'}
            audit={'before':observed['app'],'after':observed['app'],'errors':[],'productionApiRequests':[],'audit':[{'name':'scenario-tree','sha256':'wrong'}]}
            original={p:p.read_bytes() for p in (root/'web-page').rglob('*') if p.is_file()}
            for latest in [observed,dict(observed,marketingVersion='v.0.48')]:
                with self.assertRaises(ValueError): gallery.prepare(root,batch,observed,audit,latest)
                self.assertEqual({p:p.read_bytes() for p in original},original)
            audit['audit'].append({'name':'analysis','sha256':'wrong'})
            with self.assertRaises(ValueError):gallery.prepare(root,batch,observed,audit,observed)
            self.assertEqual({p:p.read_bytes() for p in original},original)

    def test_restored_gallery_retains_twelve_images(self):
        self.assertEqual(len(gallery.references((ROOT/'web-page/index.html').read_text())),12)

    def test_disabled_manifest_prevents_network_capture_or_publication(self):
        import os
        from unittest import mock
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'web-page').mkdir();(root/'web-page/website-version.json').write_text('{"version":"v.0.51","product_gallery":"disabled"}')
            output=root/'output'
            with mock.patch.object(gallery,'ROOT',root), mock.patch.object(gallery,'identity',side_effect=AssertionError('must not contact app')), mock.patch('sys.argv',['gallery','detect']), mock.patch.dict(os.environ,{'GITHUB_OUTPUT':str(output)}):
                gallery.main()
            self.assertEqual(output.read_text(),'needed=false\n')
            self.assertFalse((root/'.gallery-observed.json').exists())

    def test_successful_complete_candidate_generates_all_byte_acceptance_and_output_ledger(self):
        import hashlib
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'web-page/assets/feature-screens/tr-current').mkdir(parents=True);(root/'scripts/tests').mkdir(parents=True);(root/'specs/changes').mkdir(parents=True)
            html='<meta content="v.0.47"><div class="capability-screens"><img src="assets/feature-screens/tr-current/scenario-tree.jpg"><dialog id="feature-screen-dialog">'
            (root/'web-page/index.html').write_text(html);(root/'web-page/website-version.json').write_text('{"version":"v.0.47"}')
            batch=root/'batch';batch.mkdir();data=b'\xff\xd8\xff'+b'x'*10000;(batch/'scenario-tree.jpg').write_bytes(data)
            observed={'app':{'version':'0.23','commit':'a'*40},'marketingVersion':'v.0.47'}
            audit={'before':observed['app'],'after':observed['app'],'errors':[],'productionApiRequests':[],'audit':[{'name':'scenario-tree','sha256':hashlib.sha256(data).hexdigest(),'route':'/ai/olasilik'}]}
            ledger=gallery.prepare(root,batch,observed,audit,observed)
            self.assertEqual(ledger['marketingVersion'],'v.0.48')
            self.assertIn('scenario-tree.jpg?v=0.48', (root/'web-page/index.html').read_text())
            self.assertFalse(gallery.needed(dict(observed,marketingVersion='v.0.48'),ledger))
            self.assertEqual((root/'web-page/assets/feature-screens/tr-current/scenario-tree.jpg').read_bytes(),data)
            self.assertIn(hashlib.sha256(data).hexdigest(),(root/'scripts/tests/test_generated_gallery.py').read_text())
            # The candidate reached protected main but activation failed: a new complete
            # marketing SHA can retry the latched immutable publisher without manual edits.
            retry=gallery.prepare(root,batch,observed,audit,observed)
            self.assertEqual(retry['marketingVersion'],'v.0.49')
            self.assertEqual(retry['sourceMarketingVersion'],'v.0.47')
            self.assertEqual(json.loads((root/'specs/changes/generated-gallery.json').read_text())['changes'][0]['files'],['web-page/index.html','web-page/website-version.json'])
            audit['productionApiRequests']=['/api/cases']
            with self.assertRaises(ValueError):gallery.validate_batch(gallery.references(html),batch,audit,observed)

    def test_public_capture_routes_all_browser_api_and_blocks_service_workers(self):
        source=(ROOT/'scripts/capture-public-gallery.cjs').read_text()
        self.assertIn("c.route('**/*'",source)
        self.assertIn("u.pathname.startsWith('/api/')",source)
        self.assertIn("serviceWorkers:'block'",source)
        self.assertIn("route.fulfill",source)
        self.assertIn("Public source changed during capture",source)
        workflow=(ROOT/'.github/workflows/versioned-gallery.yml').read_text()
        self.assertIn("cron: '*/5 * * * *'",workflow)
        self.assertIn('frontend/app-version.json',workflow)
        self.assertIn('git merge-base --is-ancestor "$APP_COMMIT" origin/main',workflow)
        self.assertIn('web-page/website-version.json',workflow)
        publisher=(ROOT/'scripts/publish-gallery-pr.py').read_text()
        self.assertIn("'--auto','--merge'",publisher)
        self.assertIn('gallery.identity()!=expected',publisher)
        self.assertIn('not runtime_unchanged(base)',publisher)
        self.assertIn("'--match-head-commit',head",publisher)
        self.assertIn("'ci.yml','--ref',branch",publisher)
        self.assertIn('set(staged)-set(paths)',publisher)

    def test_http_end_to_end_both_version_triggers_publish_all_bytes_and_suppress_output(self):
        import hashlib
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        import threading
        from unittest.mock import patch
        public={'app':{'version':'0.23','commit':'a'*40},'site':{'version':'v.0.47'},'files':{}}
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args): pass
            def do_GET(self):
                path=self.path.split('?')[0]
                if path=='/app/release.json': data=json.dumps(public['app']).encode()
                elif path=='/site/release.json': data=json.dumps(public['site']).encode()
                elif path=='/app/api/health': data=b'{"status":"ok"}'
                else: data=public['files'].get(path,b'')
                self.send_response(200 if data else 404);self.end_headers();self.wfile.write(data)
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            origin='http://127.0.0.1:'+str(server.server_port)
            with patch.object(gallery,'APP',origin+'/app'),patch.object(gallery,'SITE',origin+'/site'),tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);(root/'web-page/assets/feature-screens/tr-current').mkdir(parents=True);(root/'scripts/tests').mkdir(parents=True);(root/'specs/changes').mkdir(parents=True)
                html='<meta content="v.0.47"><div class="capability-screens"><img src="assets/feature-screens/tr-current/scenario-tree.jpg?v=0.47"><img src="assets/feature-screens/tr-current/analysis.jpg?v=0.47"><dialog id="feature-screen-dialog">'
                (root/'web-page/index.html').write_text(html);(root/'web-page/website-version.json').write_text('{"version":"v.0.47"}')
                baseline=gallery.identity();ledger=baseline
                batch=root/'batch';batch.mkdir()
                for trigger in ['app','marketing']:
                    if trigger=='app':public['app']={'version':'0.24','commit':'b'*40}
                    else:
                        public['site']['version']=gallery.next_version(public['site']['version'])
                        (root/'web-page/website-version.json').write_text(json.dumps(public['site']))
                    observed=gallery.identity()
                    self.assertTrue(gallery.needed(observed,ledger))
                    captures=[]
                    for index,name in enumerate(['scenario-tree','analysis']):
                        data=b'\xff\xd8\xff'+(trigger+name).encode()*2000;(batch/(name+'.jpg')).write_bytes(data)
                        captures.append({'name':name,'route':'/route/'+name,'sha256':hashlib.sha256(data).hexdigest()})
                    audit={'before':observed['app'],'after':observed['app'],'errors':[],'productionApiRequests':[],'audit':captures}
                    ledger=gallery.prepare(root,batch,observed,audit,gallery.identity())
                    public['site']['version']=ledger['marketingVersion']
                    public['files']={'/site/':(root/'web-page/index.html').read_bytes()}
                    for name in ledger['hashes']:public['files']['/site/'+name]=(root/'web-page'/name).read_bytes()
                    gallery.verify(root)
                    self.assertFalse(gallery.needed(gallery.identity(),ledger))
                    corrupt=next(iter(ledger['hashes']));public['files']['/site/'+corrupt]=b'stale cached version'
                    with self.assertRaisesRegex(ValueError,'Public image bytes differ'):gallery.verify(root)
        finally:
            server.shutdown();server.server_close();thread.join()

    def test_runtime_race_rejects_new_application_or_marketing_even_before_public_cutover(self):
        import subprocess
        from unittest.mock import patch
        module_spec=importlib.util.spec_from_file_location('publisher',ROOT/'scripts/publish-gallery-pr.py')
        publisher=importlib.util.module_from_spec(module_spec);module_spec.loader.exec_module(publisher)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            def git(*args):return subprocess.check_output(['git','-C',tmp,*args],text=True).strip()
            git('init','-q');git('config','user.name','Synthetic');git('config','user.email','synthetic@example.invalid')
            (root/'frontend').mkdir();(root/'frontend/app-version.json').write_text('{"version":"0.23"}')
            git('add','.');git('commit','-qm','base');base=git('rev-parse','HEAD');git('update-ref','refs/remotes/origin/main',base)
            with patch.object(publisher,'ROOT',root):
                self.assertTrue(publisher.runtime_unchanged(base))
                (root/'docs').mkdir();(root/'docs/check.md').write_text('evidence');git('add','.');git('commit','-qm','docs');git('update-ref','refs/remotes/origin/main',git('rev-parse','HEAD'))
                self.assertTrue(publisher.runtime_unchanged(base))
                for folder in ['frontend','backend','web-page']:
                    baseline=git('rev-parse','HEAD')
                    self.assertTrue(publisher.runtime_unchanged(baseline))
                    (root/folder).mkdir(exist_ok=True);(root/folder/'new-runtime').write_text('new');git('add','.');git('commit','-qm',folder);git('update-ref','refs/remotes/origin/main',git('rev-parse','HEAD'))
                    self.assertFalse(publisher.runtime_unchanged(baseline))

    def test_capture_runner_is_pinned_to_supported_browser_os(self):
        # A rolling runner changed to26.04 and Playwright1.56 refused before capture.
        # Keep the browser+OS compatibility contract explicit until both are reviewed.
        workflow=(ROOT/'.github/workflows/versioned-gallery.yml').read_text()
        self.assertIn('runs-on: ubuntu-24.04',workflow)
        self.assertNotIn('runs-on: ubuntu-latest',workflow)
        self.assertIn('@playwright/test@1.56.1',workflow)

    def test_exact_head_real_actions_latest_check_cannot_reuse_stale_success(self):
        module_spec=importlib.util.spec_from_file_location('publisher',ROOT/'scripts/publish-gallery-pr.py')
        publisher=importlib.util.module_from_spec(module_spec);module_spec.loader.exec_module(publisher)
        head='b'*40
        def check(id,**kwargs):return dict({'id':id,'name':'spec-governance','head_sha':head,'app':{'id':15368},'status':'completed','conclusion':'success'},**kwargs)
        old=check(1)
        self.assertEqual(publisher.required_state([old],head),'SUCCESS')
        pending=check(2,status='in_progress',conclusion=None)
        self.assertEqual(publisher.required_state([old,pending],head),'PENDING')
        failure=check(3,conclusion='failure')
        self.assertEqual(publisher.required_state([old,pending,failure],head),'FAILURE')
        current=check(4)
        unrelated=[check(90,head_sha='a'*40),check(91,app={'id':999}),check(92,name='unrelated')]
        self.assertEqual(publisher.required_state([old,pending,failure,current,*unrelated],head),'SUCCESS')
        self.assertEqual(publisher.required_state(unrelated,head),'PENDING')

    def test_own_ci_approval_rejects_other_authors_heads_and_runtime_paths(self):
        import copy
        module_spec=importlib.util.spec_from_file_location('approval',ROOT/'scripts/approve-gallery-ci.py')
        approval=importlib.util.module_from_spec(module_spec);module_spec.loader.exec_module(approval)
        refs=['assets/feature-screens/tr-current/scenario-tree.jpg']
        ledger={'hashes':{refs[0]:'a'*64}}
        fixed=[gallery.LEDGER,'web-page/index.html','web-page/website-version.json','scripts/tests/test_generated_gallery.py','specs/changes/generated-gallery.json']
        pr={'state':'OPEN','author':{'login':'app/github-actions'},'isCrossRepository':False,'baseRefName':'main','headRefName':'codex/automatic-product-gallery-1','headRefOid':'b'*40,'files':[{'path':p} for p in fixed]}
        self.assertTrue(approval.eligible(pr,ledger,'b'*40,refs))
        for key,value in [('author',{'login':'other'}),('headRefOid','c'*40),('isCrossRepository',True),('baseRefName','other'),('headRefName','arbitrary')]:
            bad=copy.deepcopy(pr);bad[key]=value
            with self.assertRaises(ValueError):approval.eligible(bad,ledger,'b'*40,refs)
        bad=copy.deepcopy(pr);bad['files'].append({'path':'backend/app/main.py'})
        with self.assertRaises(ValueError):approval.eligible(bad,ledger,'b'*40,refs)
        with self.assertRaises(ValueError):approval.eligible(pr,{'hashes':{}},'b'*40,refs)
