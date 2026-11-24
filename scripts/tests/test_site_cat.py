"""Marketing "site cat" widget acceptance (static checks + the widget's node:test suite)."""
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / 'web-page'
PAGES = ['index.html', 'olasilik-agaci.html', 'team.html', 'timeline.html', 'investors.html', 'gorsel-kaynaklari.html']
LOADER = re.compile(r'<script src="site-cat-loader\.js\?v=([\d.]+)" data-api="https://app\.casebridge\.com\.tr/api/public/site-chat" defer></script>')


class SiteCatAcceptance(unittest.TestCase):
    def test_widget_logic_suite_passes(self):
        # Chips/FAQ without network, poses, drag-snap maths, error states, bundle size.
        result = subprocess.run(['node', '--test', 'tests/e2e/marketing/site-cat-model.test.mjs'],
                                cwd=ROOT, capture_output=True, text=True, timeout=120)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('# fail 0', result.stdout.replace('ℹ', '#'))

    def test_every_marketing_page_lazy_loads_the_current_widget(self):
        version = json.loads((WEB / 'website-version.json').read_text())['version']
        for page in PAGES:
            match = LOADER.search((WEB / page).read_text())
            self.assertIsNotNone(match, page)
            self.assertEqual('v.' + match.group(1), version, page)
        loader = (WEB / 'site-cat-loader.js').read_text()
        self.assertIn(f"site-cat.js?v={version[2:]}", loader)
        self.assertIn('requestIdleCallback', loader)

    def test_release_tool_publishes_every_widget_file(self):
        # deployment/release.py publishes only files reachable from HTML/CSS links;
        # v.0.66 shipped the loader without the widget because of that.
        import importlib.util
        spec = importlib.util.spec_from_file_location('casebridge_release', ROOT / 'deployment/release.py')
        release = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(release)
        published = set(release.marketing_files(WEB))
        wanted = {'site-cat-loader.js', 'site-cat.js', 'site-cat-model.mjs', 'site-cat.css'} | {
            f'assets/site-cat/cat-{pose}@{size}.webp' for pose in ['idle', 'thinking', 'sleeping', 'dancing', 'victory'] for size in (128, 256)}
        self.assertEqual(wanted - published, set())

    def test_widget_assets_and_privacy(self):
        for pose in ['idle', 'thinking', 'sleeping', 'dancing', 'victory']:
            for size in (128, 256):
                self.assertTrue((WEB / f'assets/site-cat/cat-{pose}@{size}.webp').is_file())
        widget = (WEB / 'site-cat.js').read_text()
        self.assertNotIn('innerHTML', widget)
        self.assertNotIn('sessionStorage', widget)
        self.assertIn("credentials: 'omit'", widget)
        css = (WEB / 'site-cat.css').read_text()
        self.assertIn('prefers-reduced-motion', css)
        self.assertIn('max-width:639px', css)


if __name__ == '__main__':
    unittest.main()
