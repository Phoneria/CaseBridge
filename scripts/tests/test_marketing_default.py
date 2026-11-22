"""Acceptance contract for the product section's first/default feature."""
from html.parser import HTMLParser
import json
import hashlib
import re
import unittest
from urllib.parse import urlsplit, parse_qs
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]


class ProductMarkup(HTMLParser):
    def __init__(self, markup):
        super().__init__(); self.tabs=[]; self.panels={}; self.version=None; self.feed(markup)

    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if attrs.get('role')=='tab' and 'data-capability-tab' in attrs:self.tabs.append(attrs)
        if attrs.get('role')=='tabpanel' and attrs.get('id','').startswith('capability-panel-'):self.panels[attrs['id']]=attrs
        if tag=='meta' and attrs.get('name')=='casebridge-website-version':self.version=attrs['content']


class MarketingDefaultAcceptance(unittest.TestCase):
    def test_tree_is_unique_first_selected_with_matching_current_panel(self):
        source=(ROOT/'web-page/index.html').read_text(); page=ProductMarkup(source)
        self.assertEqual([tab['id'] for tab in page.tabs], ['capability-tab-'+str(i) for i in [12,*range(1,12)]])
        self.assertEqual([tab['id'] for tab in page.tabs if tab['aria-selected']=='true'], ['capability-tab-12'])
        self.assertEqual([tab['id'] for tab in page.tabs if tab['tabindex']=='0'], ['capability-tab-12'])
        self.assertEqual([id for id,panel in page.panels.items() if 'hidden' not in panel], ['capability-panel-12'])
        for tab in page.tabs:self.assertEqual(page.panels[tab['aria-controls']]['aria-labelledby'],tab['id'])
        panel=re.search(r'<div role="tabpanel" id="capability-panel-12".*?</div>',source,re.S)[0]
        self.assertIn('assets/feature-screens/tr-current/scenario-tree.jpg',panel)
        self.assertIn('https://app.casebridge.com.tr/ai/olasilik',panel)
        self.assertIn('Demo tahmini',panel)

    def test_visible_marketing_version_matches_release_source(self):
        version=json.loads((ROOT/'web-page/website-version.json').read_text())['version']
        self.assertEqual(ProductMarkup((ROOT/'web-page/index.html').read_text()).version,version)
        self.assertRegex(version,r'^v\.\d+\.\d+$')

    def test_current_gallery_matches_native_capture_provenance(self):
        proof=json.loads((ROOT/'docs/validation/2026-11-22/public-gallery-provenance.json').read_text())
        version=json.loads((ROOT/'frontend/app-version.json').read_text())
        self.assertEqual(proof['application_version'],version['version'])
        self.assertEqual(proof['sourceHash'],version['sourceHash'])
        self.assertEqual(proof['release_before'],proof['release_after'])
        self.assertEqual(proof['release_before']['commit'],proof['public_application_commit'])
        self.assertEqual(proof['captureMode'],'public-served-frontend-with-isolated-synthetic-api')
        self.assertGreater(proof['proxied_request_count'],0)
        self.assertEqual(len(proof['captures']),12)
        self.assertEqual(proof['errors'],[])
        source=(ROOT/'web-page/index.html').read_text()
        panels=re.findall(r'<div role="tabpanel" id="capability-panel-\d+".*?</div>',source,re.S)
        sources=[re.search(r'<img src="([^"]+)"',panel)[1] for panel in panels]
        images=[urlsplit(src).path.split('/')[-1] for src in sources]
        cache_version=json.loads((ROOT/'web-page/website-version.json').read_text())['version'].removeprefix('v.')
        for panel,src in zip(panels,sources):
            self.assertEqual(parse_qs(urlsplit(src).query),{'v':[cache_version]})
            self.assertEqual(re.search(r'<a [^>]*data-feature-screen[^>]*href="([^"]+)"',panel)[1],src)
        self.assertEqual(len(set(images)),12)
        self.assertEqual(set(images),{c['name']+'.jpg' for c in proof['captures']})
        for capture in proof['captures']:
            image=ROOT/'web-page/assets/feature-screens/tr-current'/(capture['name']+'.jpg')
            self.assertEqual(hashlib.sha256(image.read_bytes()).hexdigest(),capture['sha256'])
            self.assertNotEqual(capture['previous_sha256'],capture['sha256'])
            self.assertEqual(capture['viewport']['width'],1600)
            self.assertEqual(capture['visible_application_version'],version['version'])
            self.assertEqual(capture['branding']['aiLinks'],9)
            self.assertTrue(capture['branding']['bluePanel'])
            self.assertEqual(capture['branding']['logoSrc'],'/casebridge-logo.png')
            self.assertEqual(capture['branding']['logoBlend'],'multiply')
            self.assertEqual(capture['branding']['logoWrapperBackground'],'rgba(0, 0, 0, 0)')
