import hashlib
import json
from pathlib import Path
import unittest

class GeneratedGalleryTests(unittest.TestCase):
    def test_complete_versioned_gallery_bytes(self):
        root = Path(__file__).resolve().parents[2]
        expected = {'assets/feature-screens/tr-current/scenario-tree.jpg': 'cda3283117faf9c29a28a8fd341c91ff81f4e92f47ba64660e4b0a1510beb5f1', 'assets/feature-screens/tr-current/analysis.jpg': '441cffb12f028ba22de61a1a7199f8f85aeb61f940e65f0fd1044428d50f9f2a', 'assets/feature-screens/tr-current/conversation.jpg': 'dd960f6b892f018a09274b63bdb1681ee1029ec8aaaaf3cba658719f23dc84cc', 'assets/feature-screens/tr-current/evidence.jpg': 'a4876190f85fb376935f3893a866a7c46c6a25df086afe3655f5e52cf6f643a5', 'assets/feature-screens/tr-current/evaluation.jpg': '87832f4d4b56c6732fb858d30624d2613dea2b4c646065136fd49aeeb8257b80', 'assets/feature-screens/tr-current/assistant.jpg': '17292c6f78c9a83927096a24dc4a382ea36b4670b84c4d4a0b47f944fc9df66b', 'assets/feature-screens/tr-current/case-documents.jpg': 'cb7eda349fb2d6f568f4c341d3f2b4e4c0e449515b3e9a66d0567b38bcc3538d', 'assets/feature-screens/tr-current/calendar.jpg': '050c6d2ae42b4a4c7d86e3757d779f78123dc908a864e451f6763bf30cd1cd14', 'assets/feature-screens/tr-current/reports.jpg': '1a05a5278aa5760131fd56a4e860f48a0baa7f018a28aa3b2fe11a72e7330485', 'assets/feature-screens/tr-current/knowledge-map.jpg': '15762512d38756c621c557d8a61c2c6d5251f7eec9526e2eeb767e5ab0f40ec4', 'assets/feature-screens/tr-current/counter-analysis.jpg': 'e0d0f61d098c45b851a91f2aa6405872216de065a11496e271293b85f13f7aab', 'assets/feature-screens/tr-current/directed-trial.jpg': 'f49a1c7f312580935021bf78c193604c38ebf5bcfe9c9666b2c8a6d2cd59b7c7'}
        ledger = json.loads((root/'web-page/assets/feature-screens/tr-current/AUTO_CAPTURE.md').read_text())
        self.assertEqual(ledger['hashes'], expected)
        manifest=json.loads((root/'web-page/website-version.json').read_text())
        if manifest.get('product_gallery')=='disabled':
            self.assertEqual(ledger['marketingVersion'],'v.0.48')  # preserved historical batch, not the current homepage
            self.assertNotIn('assets/feature-screens/tr-current/',(root/'web-page/index.html').read_text())
        else:
            self.assertEqual(manifest['version'],ledger['marketingVersion'])
        for name, digest in expected.items():
            self.assertEqual(hashlib.sha256((root/'web-page'/name).read_bytes()).hexdigest(), digest)
        from scripts.tests.test_marketing_default import MarketingDefaultAcceptance
        result = unittest.TestResult()
        unittest.defaultTestLoader.loadTestsFromTestCase(MarketingDefaultAcceptance).run(result)
        self.assertTrue(result.wasSuccessful(), str(result.errors + result.failures))
