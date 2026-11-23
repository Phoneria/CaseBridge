import json
import re
import subprocess
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[2]

class Page(HTMLParser):
    def __init__(self):super().__init__();self.urls=[];self.ids=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if 'id' in attrs:self.ids.append(attrs['id'])
        for key in ('src','href'):
            if key in attrs:self.urls.append(attrs[key])

class NightAtlas(unittest.TestCase):
    def test_fictional_journey_model(self):
        result=subprocess.run(['node','--test','tests/e2e/marketing/night-atlas-model.test.mjs'],cwd=ROOT,text=True,capture_output=True)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
    def test_static_resources_and_real_conversion(self):
        root=ROOT/'web-page';page=Page();page.feed((root/'index.html').read_text())
        self.assertEqual(len(page.ids),len(set(page.ids)))
        for url in page.urls:
            parsed=urlparse(url)
            if parsed.scheme:continue
            if parsed.path:self.assertTrue((root/parsed.path).is_file(),url)
            elif parsed.fragment:self.assertIn(parsed.fragment,page.ids)
        for name in ['manrope-latin-v23.woff2','manrope-latin-ext-v23.woff2']:
            self.assertEqual((root/'assets/night-atlas'/name).read_bytes()[:4],b'wOF2')
        css=(root/'night-atlas.css').read_text()
        for url in re.findall(r'url\(([^)]+)\)',css):
            url=url.strip('\'"')
            if not url.startswith('data:'):self.assertTrue((root/url).is_file(),url)
        self.assertIn('https://calendar.app.google/RL4CxQFEZAuVF2xP9',page.urls)
        self.assertTrue({'gecmis','olasilik','prova','buro'}.issubset(page.ids))
        self.assertRegex(json.loads((root/'website-version.json').read_text())['version'],r'^v\.\d+\.\d+$')
