"""Current marketing acceptance. The prior screenshot-tab homepage is retired."""
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
    def test_four_values_have_a_single_connected_fictional_journey(self):
        result=subprocess.run(['node','--test','tests/e2e/marketing/night-atlas-model.test.mjs'],cwd=ROOT,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        source=(ROOT/'web-page/index.html').read_text()
        for section in ['gecmis','olasilik','prova','buro']:self.assertIn('id="'+section+'"',source)
        self.assertNotIn('assets/feature-screens/tr-current/',source)
        self.assertIn('tamamen kurgusaldır',source)
    def test_visible_marketing_version_matches_release_source(self):
        version=json.loads((ROOT/'web-page/website-version.json').read_text())['version']
        self.assertEqual(ProductMarkup((ROOT/'web-page/index.html').read_text()).version,version)
        self.assertRegex(version,r'^v\.\d+\.\d+$')
