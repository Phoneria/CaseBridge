"""Acceptance for the v.0.54 3D story homepage (specs/016-3d-story-homepage)."""
import importlib.util
import json
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / 'web-page'
DEMO = 'https://calendar.app.google/RL4CxQFEZAuVF2xP9'


class Page(HTMLParser):
    def __init__(self, markup):
        super().__init__()
        self.scenes, self.hrefs, self.chips, self.outcomes, self.ids = {}, [], [], [], []
        self.feed(markup)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'data-scene' in a:
            self.scenes[a['data-scene']] = a.get('id')
        if 'href' in a:
            self.hrefs.append(a['href'])
        if 'data-chip' in a:
            self.chips.append((a['data-chip'], a.get('aria-pressed')))
        if 'data-out' in a:
            self.outcomes.append(a['data-out'])
        if 'id' in a:
            self.ids.append(a['id'])


def release_module():
    spec = importlib.util.spec_from_file_location('release', ROOT / 'deployment/release.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Story3DHomepage(unittest.TestCase):
    def setUp(self):
        self.html = (SITE / 'index.html').read_text()
        self.page = Page(self.html)

    def test_five_feature_chapters_with_real_ctas(self):
        self.assertEqual(self.page.scenes, {'0': 'top', '1': 'gecmis', '2': 'olasilik', '3': 'anonim', '4': 'buro', '5': 'sufle'})
        for title in ['Biten davayı geri sarın.', 'Süren dava nasıl biter', 'Kişisel veri, modele gitmeden maskelenir.', 'Büronuzu tek bakışta görün.', 'Görüşme sürerken']:
            self.assertIn(title, self.html)
        for anchor in ['#gecmis', '#olasilik', '#anonim', '#buro', '#sufle', '#team']:
            self.assertIn(anchor, self.page.hrefs)
        self.assertIn(DEMO, self.page.hrefs)
        self.assertIn('https://app.casebridge.com.tr/login', self.page.hrefs)
        self.assertIn('gorsel-kaynaklari.html', self.page.hrefs)
        self.assertEqual(len(re.findall(r'class="brand-lockup"', self.html)), 2)
        version = json.loads((SITE / 'website-version.json').read_text())['version']
        self.assertIn(f'<span class="site-version">{version}</span>', self.html)

    def test_probability_demo_is_labelled_scenario_assumption_without_unverified_claims(self):
        self.assertEqual(self.page.chips, [('expert', 'false'), ('precedent', 'false'), ('settle', 'false')])
        self.assertEqual(self.page.outcomes, ['kabul', 'kismi', 'ret', 'sulh'])
        initial = [int(n) for n in re.findall(r'<output>%(\d+)</output>', self.html)]
        self.assertEqual(sum(initial), 100)
        self.assertIn('Yüzdeler senaryo varsayımıdır; kalibre edilmiş bir kazanma olasılığı değildir.', self.html)
        for fictional in ['Kurgusal kira dosyası.', 'Kurgusal büro verisi.', 'Kurgusal görüşme.']:
            self.assertIn(fictional, self.html)
        for claim in ['10 TB', '100.000', 'müşterimiz', 'garanti']:
            self.assertNotIn(claim, self.html)

    def test_release_closure_ships_self_contained_story_bundle(self):
        files = release_module().marketing_files(SITE)
        for name in ['story3d.js', 'story3d.css', 'assets/night-atlas/manrope-latin-v23.woff2',
                     'assets/night-atlas/manrope-latin-ext-v23.woff2', 'kira-agaci.js', 'assets/team/emin-merden-web.jpg']:
            self.assertIn(name, files)
        bundle = (SITE / 'story3d.js').read_text()
        # The static release copies only HTML/CSS-referenced files, so the module must not import siblings.
        self.assertNotRegex(bundle, r'''(?:\bfrom\s*|\bimport\s*\(?\s*)["'](?:\.{1,2}/|/)''')
        self.assertLess((SITE / 'story3d.js').stat().st_size, 900_000)
        self.assertIn('prefers-reduced-motion', bundle)
        self.assertIn('no-webgl', bundle)
        self.assertTrue((ROOT / 'specs/016-3d-story-homepage/source/story3d.src.js').is_file())


    def test_hero_feedback_headspace_document_text_and_slower_morph(self):
        css = (SITE / 'story3d.css').read_text()
        self.assertIn('padding-top: 84px', css)
        self.assertIn('.chapter-hero { height: 320vh; }', css)
        source = (ROOT / 'specs/016-3d-story-homepage/source/story3d.src.js').read_text()
        for marker in ['PAGE_BODY', "'GEREKÇELİ KARAR'", 'Kurgusal örnek', 'node.userData.tag = tag']:
            self.assertIn(marker, source)
        self.assertIn('Kurgusal', (SITE / 'story3d.js').read_text())


if __name__ == '__main__':
    unittest.main()
