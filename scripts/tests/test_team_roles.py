"""Public responsibility and private-source boundary for the team section."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

class TeamRolesAcceptance(unittest.TestCase):
    def test_five_members_have_nonconflicting_roles_and_public_professional_bios(self):
        source = (ROOT/'web-page/team.html').read_text()
        team = re.search(r'<section[^>]*id="team"[^>]*>(.*?)</section>', source, re.S)[1]
        cards = re.findall(r'<article class="team-person">(.*?)</article>', team, re.S)
        expected = [('İzzet Ahmet', 'İş geliştirme ve iş ortaklıkları'), ('Emin Merden', 'Yapay zekâ ve veri'), ('Hatice Çam', 'Yazılım altyapısı ve sistem mimarisi'), ('Bengü Özbek', 'Ekosistem ilişkileri'), ('Ahmet Büyükdağ', 'Hukuki içerik ve ürün danışmanlığı')]
        actual = [(re.search(r'<h3>(.*?)</h3>',card)[1],re.search(r'<p class="team-role">(.*?)</p>',card)[1]) for card in cards]
        self.assertEqual(actual, expected)
        self.assertEqual(len({role for _,role in actual}),5)
        emin=cards[1]
        for fact in ['BAUROV', 'yazılım ekip liderliği', 'Baykar', 'makine öğrenmesi stajı', 'Outlier AI', 'dil modeli değerlendirme', 'sentetik veri']:self.assertIn(fact,emin)
        self.assertIn('<img class="member-photo" src="assets/team/emin-merden-web.jpg" alt="Emin Merden" width="240" height="252" loading="lazy">',emin)
        self.assertNotIn('>EM</span>',emin)
        image=ROOT/'web-page/assets/team/emin-merden-web.jpg'
        self.assertTrue(image.is_file())
        self.assertGreater(image.stat().st_size,10000)
        self.assertNotRegex(team.lower(),r'mailto:|tel:|@|\.pdf|yatırım')
        self.assertIn('Veritabanları, veri akışları ve uygulama altyapısı',cards[2])
        self.assertIn('hukuki senaryolar, analiz çerçevesi',cards[4])
        self.assertIn('href="team.html"',(ROOT/'web-page/index.html').read_text())
        self.assertNotRegex(source,r'<script[^>]+src="(?:team-profiles|i18n[^"/]*).*?"')
