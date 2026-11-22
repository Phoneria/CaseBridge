import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('auto_ui', Path(__file__).parents[1] / 'auto-ui.py')
auto = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auto)


class AutoUiTests(unittest.TestCase):
    def test_classify_runtime_boundaries_and_companion_files(self):
        ui = ['frontend/app-version.json', 'frontend/src/components/Sidebar.tsx', 'frontend/src/app/theme.css',
              'frontend/src/components/__tests__/Sidebar.test.tsx', 'specs/changes/visual.json', 'todo.md']
        self.assertEqual(auto.classification(ui), 'app')
        self.assertEqual(auto.classification(ui + ['web-page/index.html']), 'all')
        self.assertEqual(auto.classification(['web-page/styles.css', 'web-page/website-version.json']), 'marketing')
        self.assertEqual(auto.classification(['docs/evidence.json', 'specs/changes/change.json']), 'none')
        for mixed in ('backend/app/main.py', '.github/workflows/ci.yml', 'frontend/src/app/api/route.ts',
                      'frontend/src/lib/api.ts', 'frontend/package.json', 'deployment/compose.production.yml',
                      'backend/alembic/versions/schema.py', 'frontend/Dockerfile'):
            with self.subTest(mixed=mixed):
                self.assertEqual(auto.classification(ui + [mixed]), 'standard')

    def test_rename_out_of_backend_cannot_be_treated_as_ui(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            git = lambda *args: subprocess.check_output(['git', '-C', folder, *args]).decode().strip()
            git('init', '-q')
            git('config', 'user.email', 'test@example.invalid')
            git('config', 'user.name', 'test')
            (root/'backend').mkdir()
            (root/'backend/old.py').write_text('old')
            git('add', '.')
            git('commit', '-qm', 'base')
            base = git('rev-parse', 'HEAD')
            (root/'web-page').mkdir()
            git('mv', 'backend/old.py', 'web-page/index.html')
            git('commit', '-qm', 'rename')
            paths = auto.git_paths(root, base, git('rev-parse', 'HEAD'))
            self.assertEqual(auto.classification(paths), 'standard')

    def test_publish_does_not_activate_if_stage_fails_or_backend_changes(self):
        from unittest.mock import MagicMock, patch
        import json
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            base, head = 'a' * 40, 'b' * 40
            (root/'current.json').write_text(json.dumps({'commit': base, 'application_commit': base,
                                                        'marketing_commit': base, 'operation': 'activate'}))
            (root/'auto-ui.json').write_text(json.dumps({'baseline': base}))
            release = MagicMock(INVENTORY=root, REPO=root, GIT='git', ReleaseError=ValueError)
            release.validate_sha.side_effect = lambda s:s
            release.run.side_effect = lambda cmd: json.dumps({'version':'0.2' if head in cmd[-1] else '0.1'})
            with patch.object(auto, 'pull', return_value=head), patch.object(auto, 'git_paths', return_value=['web-page/index.html']):
                release.stage.side_effect = ValueError('failed canary')
                with self.assertRaisesRegex(ValueError, 'canary'):
                    auto.publish(release)
                release.activate.assert_not_called()
                release.stage.side_effect = None
                release.load_release.side_effect = [(None, {'scope':'marketing','images':{'cb-backend':'other'}}),
                                                    (None, {'images':{'cb-backend':'old'}})]
                with self.assertRaisesRegex(ValueError, 'backend image'):
                    auto.publish(release)
                release.activate.assert_not_called()
