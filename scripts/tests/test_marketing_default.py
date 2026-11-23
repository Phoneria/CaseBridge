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
    def test_public_example_preserves_homepage_and_opens_reviewable_documents(self):
        home=(ROOT/'web-page/index.html').read_text()
        self.assertIn('assets/video/casebridge-hero.mp4',home)
        self.assertGreaterEqual(home.count('href="ornek-dava.html"'),2)
        example=(ROOT/'web-page/ornek-dava.html').read_text()
        self.assertIn('Tamamen kurgusal dava',example)
        self.assertIn('yapay zekâyla',example)
        for document in ['siparis','teslim','itiraz']:
            self.assertIn('<details id="'+document+'">',example)
        for asset in ['ornek-dava.css','ornek-dava.js']:
            self.assertIn(asset,example)
            self.assertTrue((ROOT/'web-page'/asset).is_file())

    def test_visible_marketing_version_matches_release_source(self):
        version=json.loads((ROOT/'web-page/website-version.json').read_text())['version']
        self.assertEqual(ProductMarkup((ROOT/'web-page/index.html').read_text()).version,version)
        self.assertRegex(version,r'^v\.\d+\.\d+$')
