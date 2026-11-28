"""Audit log: the application version manifest matches the sources (FR-010)."""
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class AuditLogAcceptance(unittest.TestCase):
    def test_app_version_manifest_matches_the_sources(self):
        manifest = json.loads((ROOT / 'frontend' / 'app-version.json').read_text())
        self.assertRegex(manifest.get('version', ''), r'^\d+\.\d+$')
        self.assertRegex(manifest.get('sourceHash', ''), r'^[0-9a-f]{64}$')
        self.assertEqual(manifest.get('sourceScope'), 'application')
        result = subprocess.run(['node', 'frontend/scripts/update-version.mjs', '--check'],
                                cwd=ROOT, capture_output=True, text=True, timeout=120)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), f"CaseBridge v{manifest['version']}")


if __name__ == '__main__':
    unittest.main()
