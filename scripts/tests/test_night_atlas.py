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
