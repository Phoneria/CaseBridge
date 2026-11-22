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

    def test_every_current_product_reference_is_bound_and_tree_first(self):
        names=gallery.references((ROOT/'web-page/index.html').read_text())
        self.assertEqual(len(names),12)
        self.assertEqual(Path(names[0]).stem,'scenario-tree')
        self.assertEqual(len(names),len(set(names)))
        with self.assertRaises(ValueError):gallery.references('<div class="capability-screens"><img src="assets/feature-screens/tr-current/analysis.jpg"><dialog id="feature-screen-dialog">')

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
        self.assertIn('web-page/website-version.json',workflow)
        publisher=(ROOT/'scripts/publish-gallery-pr.py').read_text()
        self.assertIn("'--auto','--merge'",publisher)
        self.assertIn("'ci.yml','--ref',branch",publisher)
        self.assertIn('set(staged)-set(paths)',publisher)
