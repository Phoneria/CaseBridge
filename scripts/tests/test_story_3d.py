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
        self.assertEqual(self.page.scenes, {'0': 'top', '1': 'gecmis', '2': 'olasilik', '3': 'anonim', '4': 'buro', '5': 'sufle', '6': 'simulasyon'})
        for title in ['Biten davayı geri sarın.', 'Süren dava nasıl biter', 'Kişisel veri, modele gitmeden maskelenir.', 'Büronuzu tek bakışta görün.', 'Görüşme sürerken', 'Duruşmaya girmeden önce prova edin.']:
            self.assertIn(title, self.html)
        for anchor in ['#gecmis', '#olasilik', '#anonim', '#buro', '#sufle', '#simulasyon', '#team', 'olasilik-agaci.html']:
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
        for fictional in ['Kurgusal kira dosyası.', 'Kurgusal büro verisi.', 'Kurgusal görüşme.', 'Kurgusal prova. Puan bir eğitim değerlendirmesidir; gerçek dava sonucu tahmini değildir.']:
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


    def test_tree_grows_rightward_simulation_scene_and_labels_on_top(self):
        source = (ROOT / 'specs/016-3d-story-homepage/source/story3d.src.js').read_text()
        for marker in ["['bR', 'ist']", "ist: 'İstinaf'", 'm.userData.win', 'scenes[6] = ', "card('KARŞI VEKİL'", "'HÂKİM DEĞERLENDİRMESİ · EĞİTİM PUANI'", 'sprite.renderOrder = 20;', 'incoming.forEach']:
            self.assertIn(marker, source)
        self.assertNotIn('id="lease-view"', self.html)
        files = release_module().marketing_files(SITE)
        for name in ['olasilik-agaci.html', 'kira-agaci.js', 'kira-agaci.css']:
            self.assertIn(name, files)


    def test_hero_network_hands_over_to_timeline_and_tree_labels_stay_in_frame(self):
        source = (ROOT / 'specs/016-3d-story-homepage/source/story3d.src.js').read_text()
        for marker in ['heroNet.ends = net', 'applyMatrix4(heroM).applyMatrix4(toLocal)', 'fade = (prevActive + active === 1) ? 1 : 0',
                       "LABEL_OFF = { bR: [0, -0.42], c: [0, -0.42], iK: [0, 0.42], iO: [0, -0.42] }", 'fit: [5.6, 2.8], camera: cam']:
            self.assertIn(marker, source)
        self.assertNotIn('const settle = seg(p, 0.9, 1);', source)
        self.assertIn('<li data-at="0.22"><strong>Kayıtlı yol', self.html)


    def test_fast_scroll_is_damped_not_blocked(self):
        source = (ROOT / 'specs/016-3d-story-homepage/source/story3d.src.js').read_text()
        for marker in ['MAX_PROGRESS_PER_S = 0.55', 'SCROLL_DAMP = 4.5', 'if (ch._sp === undefined || reduceMotion) ch._sp = p;', 'cp = ch._sp']:
            self.assertIn(marker, source)

    def test_wheel_speed_is_capped_inside_story_only(self):
        source = (ROOT / 'specs/016-3d-story-homepage/source/story3d.src.js').read_text()
        for marker in ['MAX_SCROLL_VH_PER_S = 1.1', 'MAX_QUEUED_VH = 1.2', "if (reduceMotion || e.ctrlKey || e.metaKey", 'if (from >= storyEnd() && dy > 0) return release();',
                       "addEventListener('keydown', () => { wheelDriving = false;", '{ passive: false }']:
            self.assertIn(marker, source)
        self.assertNotIn("addEventListener('touchmove'", source)
        self.assertNotIn('overflow: hidden', (SITE / 'story3d.css').read_text().split('/* real application tree snapshot */')[0].split('.wordmark-line')[0])

    def test_native_scroll_below_story_is_not_pulled_back(self):
        source = (ROOT / 'specs/016-3d-story-homepage/source/story3d.src.js').read_text()
        self.assertIn('const release = () => { wheelDriving = false; wheelTarget = scrollY; };', source)
        self.assertIn('if (from >= storyEnd() && dy > 0) return release();', source)
        self.assertIn('return release();', source.split('if (scrollY > storyEnd() + innerHeight * 0.25 && dy < 0)')[1][:20])

    def test_case_bridge_logo_and_navy_offwhite_palette(self):
        self.assertEqual(self.html.count('src="assets/casebridge-logo.svg'), 2)
        self.assertNotIn('bridge-wordmark', self.html)
        logo = (SITE / 'assets/casebridge-logo.svg').read_text()
        for part in ['>CASE<', '>BRIDGE<', '#4a6394', '#14213d']:
            self.assertIn(part, logo)
        css = (SITE / 'story3d.css').read_text()
        self.assertIn('--bg: #f7f4ec;', css)
        self.assertIn('--teal: #1c2e5a;', css)
        self.assertIn('color-scheme: light;', css)
        self.assertNotIn('#68dfcf', css + (SITE / 'site-cat.css').read_text())
        self.assertIn('<meta name="theme-color" content="#f7f4ec">', self.html)


if __name__ == '__main__':
    unittest.main()
