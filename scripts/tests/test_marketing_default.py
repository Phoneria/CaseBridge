"""Marketing homepage and public scenario example acceptance."""
from html.parser import HTMLParser
import json
import subprocess
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
class ProductMarkup(HTMLParser):
    def __init__(self,markup):super().__init__();self.version=None;self.feed(markup)
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='meta' and attrs.get('name')=='casebridge-website-version':self.version=attrs['content']
class MarketingDefaultAcceptance(unittest.TestCase):
    def test_lease_tree_replaces_product_gallery_inline(self):
        home=(ROOT/'web-page/index.html').read_text()
        self.assertIn('assets/video/casebridge-hero.mp4',home)
        self.assertIn('CB-SONUC-2025/142-1',home)
        self.assertIn('id="lease-view"',home)
        self.assertIn('demo-delil-kontrol-listesi.txt',home)
        self.assertNotIn('ornek-dava.html',home)
        self.assertNotIn('Davanızı hazırlayın',home)
        self.assertNotIn('data-capability-explorer',home)
        for ext in ('html','js','css'):
            self.assertFalse((ROOT/'web-page'/('ornek-dava.'+ext)).exists())

    def test_visible_marketing_version_matches_release_source(self):
        version=json.loads((ROOT/'web-page/website-version.json').read_text())['version']
        self.assertEqual(ProductMarkup((ROOT/'web-page/index.html').read_text()).version,version)
        self.assertRegex(version,r'^v\.\d+\.\d+$')
