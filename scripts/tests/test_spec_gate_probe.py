"""Concrete acceptance for the unmerged probe, not application behavior."""
import importlib.util
import unittest
from pathlib import Path


class ProbeAcceptance(unittest.TestCase):
    def test_probe_message_matches_contract(self):
        spec = importlib.util.spec_from_file_location('probe', Path(__file__).resolve().parents[1]/'spec-gate-probe.py')
        probe = importlib.util.module_from_spec(spec); spec.loader.exec_module(probe)
        self.assertEqual(probe.acceptance_message(), 'acceptance-probe')
