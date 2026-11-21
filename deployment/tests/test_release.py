"""Negative/security and recovery tests; no server or real secret access."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release', Path(__file__).parents[1] / 'release.py')
r = importlib.util.module_from_spec(spec); spec.loader.exec_module(r)
A, B = 'a' * 40, 'b' * 40


class ReleaseTests(unittest.TestCase):
    def test_rejects_caller_paths_shell_and_non_sha_revisions(self):
        for value in ['main', '../main', '-x', A + ';id', A.upper(), 'a' * 39, 'a' * 41]:
            with self.subTest(value=value), self.assertRaises(r.ReleaseError): r.validate_sha(value)
        self.assertEqual(r.validate_sha(A), A)
        for value in ['/tmp/code', '../secret', 'ok/../../secret', '.']:
            with self.subTest(value=value), self.assertRaises(r.ReleaseError): r.safe_relative(value)

    def test_file_hash_mismatch_and_symlink_escape_fail_closed(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work); (root / 'file').write_text('verified')
            expected = {'file': r.digest(root / 'file')}; r.verify_files(root, expected)
            (root / 'file').write_text('tampered')
            with self.assertRaises(r.ReleaseError): r.verify_files(root, expected)
            (root / 'file').unlink(); (root / 'file').symlink_to('/etc/hosts')
            with self.assertRaises(r.ReleaseError): r.verify_files(root, expected)

    def test_git_archive_links_are_rejected_before_extraction(self):
        for name, kind in [('escape', tarfile.SYMTYPE), ('../escape', tarfile.REGTYPE)]:
            data = io.BytesIO()
            with tarfile.open(fileobj=data, mode='w') as archive:
                member = tarfile.TarInfo(name); member.type = kind; member.linkname = '/etc/hosts'; archive.addfile(member)
            with tempfile.TemporaryDirectory() as work, patch.object(r, 'run', return_value=data.getvalue()):
                with self.assertRaises(r.ReleaseError): r.export_source(A, Path(work))

    def test_stage_rejects_non_main_before_build_or_export(self):
        with patch.object(r, 'owned'), patch.object(r, 'run', side_effect=['https://github.com/Phoneria/CaseBridge.git', '', B]) as command, patch.object(r, 'export_source') as export:
            with self.assertRaisesRegex(r.ReleaseError, 'current GitHub main'): r.stage(A, 'all')
            export.assert_not_called(); self.assertEqual(command.call_count, 3)

    def test_stage_rejects_other_repository(self):
        with patch.object(r, 'owned'), patch.object(r, 'run', return_value='https://example.org/Phoneria/CaseBridge.git'):
            with self.assertRaisesRegex(r.ReleaseError, 'repository'): r.stage(A, 'all')

    def test_manifest_rejects_tags_and_mutated_file_digests(self):
        manifest = {'format':1,'commit':A,'scope':'all','state':'staged','images':{'cb-backend':'sha256:'+'1'*64,'cb-frontend':'sha256:'+'2'*64},'source_files':{'backend/app/main.py':'3'*64},'marketing_files':{'index.html':'4'*64},'application_version':'0.20','marketing_version':'v.0.44'}
        r.validate_manifest(manifest,A)
        manifest['images']['cb-frontend']='casebridge/frontend:latest'
        with self.assertRaises(r.ReleaseError): r.validate_manifest(manifest,A)
        manifest['images']['cb-frontend']='sha256:'+'2'*64
        manifest['source_files']['backend/app/main.py']='not a hash'
        with self.assertRaises(r.ReleaseError): r.validate_manifest(manifest,A)

    def test_runtime_separates_backend_identity_and_has_no_code_mount(self):
        config = r.runtime_config({'cb-backend': 'sha256:a', 'cb-frontend': 'sha256:b'}, A, '0.20', {'commit': B, 'version': '0.19'}, legacy=True)['services']
        for service in config.values():
            self.assertTrue(service['read_only']); self.assertEqual(service['cap_drop'], ['ALL']); self.assertNotIn('volumes', service)
        self.assertEqual(config['cb-frontend']['user'], '1000:1000')
        self.assertEqual(config['cb-backend']['environment']['CASEBRIDGE_RELEASE_COMMIT'], B)

    def test_unverified_rollback_rejected_before_runtime_changes(self):
        with patch.object(r, 'load_release', return_value=(Path('/unused'), {'state': 'staged'})), patch.object(r, 'run') as command:
            with self.assertRaisesRegex(r.ReleaseError, 'previously verified'): r._activate(A, rollback=True)
            command.assert_not_called()

    def test_failed_activation_restores_prior_verified_main_and_health(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work); r.write_json(root / 'current.json', {'commit': A, 'operation': 'activate'})
            with patch.object(r, 'INVENTORY', root), patch.object(r, 'verify') as verify, patch.object(r, '_activate', side_effect=[r.ReleaseError('canary/public failed'), None]) as activate:
                with self.assertRaisesRegex(r.ReleaseError, 'restored'): r.activate(B)
                self.assertEqual(verify.call_count, 2)
                self.assertEqual(activate.call_args_list[1].args, (A,)); self.assertTrue(activate.call_args_list[1].kwargs['rollback'])

    def test_live_drift_stops_before_mutation_or_rollback(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work); r.write_json(root / 'current.json', {'commit': A, 'operation': 'activate'})
            with patch.object(r, 'INVENTORY', root), patch.object(r, 'verify', side_effect=r.ReleaseError('code mismatch')), patch.object(r, '_activate') as activate:
                with self.assertRaisesRegex(r.ReleaseError, 'mismatch'): r.activate(B)
                activate.assert_not_called()

    def test_frontend_only_activation_leaves_backend_running(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work); manifest = {'scope': 'app', 'state': 'staged', 'images': {'cb-backend': 'same', 'cb-frontend': 'new'}}
            state = lambda name: {'image': 'same' if 'backend' in name else 'old', 'readonly': True}
            with patch.object(r, 'INVENTORY', root), patch.object(r, 'LOGS', root), patch.object(r, 'load_release', return_value=(root, manifest)), patch.object(r, 'container_state', side_effect=state), patch.object(r, 'compose', return_value=['docker','compose']), patch.object(r, 'run') as command, patch.object(r, 'verify') as verify:
                r._activate(B)
                args = command.call_args.args[0]
                self.assertIn('cb-frontend', args); self.assertNotIn('cb-backend', args); verify.assert_called_once()

    def test_marketing_dependency_closure_keeps_original_video(self):
        files = r.marketing_files(Path(__file__).parents[2] / 'web-page')
        self.assertIn('assets/video/casebridge-hero.mp4', files)
        self.assertIn('hero-video-restoration.css', files)
        self.assertNotIn('planning/business-plan.xlsx', files)


if __name__ == '__main__': unittest.main()
