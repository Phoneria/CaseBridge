import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1]/'check-spec-changes.py'
spec = importlib.util.spec_from_file_location('spec_changes', MODULE)
gate = importlib.util.module_from_spec(spec); spec.loader.exec_module(gate)


class GateAcceptance(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.git('init', '-q'); self.git('config', 'user.email', 'synthetic@example.invalid'); self.git('config', 'user.name', 'Acceptance fixture')
        self.write('specs/001-test/spec.md', '- **FR-001**: Reject unlinked behavior.')
        self.write('app.py', 'VALUE = 1\n'); self.commit(); self.base = self.git('rev-parse', 'HEAD')

    def git(self, *args):
        return gate.git(self.root, *args)

    def write(self, path, content):
        file = self.root/path; file.parent.mkdir(parents=True, exist_ok=True); file.write_text(content)

    def commit(self):
        self.git('add', '.'); self.git('commit', '-qm', 'Synthetic acceptance state')
        return self.git('rev-parse', 'HEAD')

    def link(self, *, requirement='specs/001-test/spec.md#FR-001', selector='scripts/tests/test_behavior.py::Acceptance.test_acceptance'):
        self.write('scripts/tests/test_behavior.py', 'import unittest\nclass Acceptance(unittest.TestCase):\n    def test_acceptance(self):\n        self.assertGreater(2, 1)\n')
        self.write('specs/changes/fixture.json', json.dumps({'version':1,'changes':[{'files':['app.py'],'requirements':[requirement],'acceptance_tests':[selector],'reason':'Changed behavior needs acceptance.'}]}))

    def test_missing_link_blocks_behavior(self):
        self.write('app.py', 'VALUE = 2\n'); head=self.commit()
        with self.assertRaisesRegex(ValueError, 'lack Spec Kit'):
            gate.validate(self.root,self.base,head)

    def test_complete_link_allows_same_diff(self):
        self.write('app.py', 'VALUE = 2\n'); self.link(); head=self.commit()
        result=gate.validate(self.root,self.base,head)
        self.assertEqual(result['behavior_files'], ['app.py'])
        self.assertEqual(result['tests'][0]['name'], 'Acceptance.test_acceptance')

    def test_docs_only_requires_no_contract(self):
        self.write('docs/result.json', '{}'); self.write('README.md', 'Documentation update.'); head=self.commit()
        self.assertEqual(gate.validate(self.root,self.base,head)['tests'], [])

    def test_unknown_requirement_or_test_rejected(self):
        self.write('app.py', 'VALUE = 2\n'); self.link(requirement='specs/001-test/spec.md#FR-999'); head=self.commit()
        with self.assertRaisesRegex(ValueError,'unknown Spec Kit'):gate.validate(self.root,self.base,head)
        self.link(selector='scripts/tests/test_behavior.py::Acceptance.test_missing'); head=self.commit()
        with self.assertRaisesRegex(ValueError,'does not exist'):gate.validate(self.root,self.base,head)

    def test_unchanged_or_nonasserting_test_rejected(self):
        self.write('app.py', 'VALUE = 2\n'); self.link(); self.write('scripts/tests/test_behavior.py','import unittest\nclass Acceptance(unittest.TestCase):\n    def test_acceptance(self):\n        pass\n'); head=self.commit()
        with self.assertRaisesRegex(ValueError,'assertion'):gate.validate(self.root,self.base,head)

    def test_changed_acceptance_is_executed_and_failure_blocks(self):
        self.write('scripts/tests/test_behavior.py','import unittest\nclass Acceptance(unittest.TestCase):\n    def test_failure(self):\n        self.assertEqual(1, 2)\n')
        plan={'tests':[{'runner':'unittest','path':'scripts/tests/test_behavior.py','name':'Acceptance.test_failure'}]}
        with self.assertRaises(subprocess.CalledProcessError):gate.run_tests(self.root,plan)

    def test_deleted_behavior_still_requires_link(self):
        (self.root/'app.py').unlink(); head=self.commit()
        with self.assertRaisesRegex(ValueError,'lack Spec Kit'):gate.validate(self.root,self.base,head)
