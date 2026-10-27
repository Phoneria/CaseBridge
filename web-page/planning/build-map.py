"""Adapt a real Natural Earth-derived map for the staged expansion visual."""
from pathlib import Path
import re

assets = Path(__file__).resolve().parent.parent / 'assets'
source = (assets / 'world-source.svg').read_text(encoding='utf-8')
paths = re.findall(r'<path id="([^"]+)" d="([^"]+)"/>', source)
if len(paths) < 150:
    raise SystemExit('Expected country paths were not found')

countries = []
for code, data in paths:
    color = '#f1b75d' if code == 'tr' else '#5daac3' if code == 'us' else '#cfdae3'
    countries.append(f'<path d="{data}" fill="{color}" stroke="#f4f9fc" stroke-width="2"/>')

routes = '''
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#0d5f84"/></marker></defs>
<path d="M1195 350 Q870 120 480 350" fill="none" stroke="#0d5f84" stroke-width="9" stroke-linecap="round" marker-end="url(#arrow)"/>
<g fill="none" stroke="#ad4953" stroke-width="5" stroke-dasharray="12 14" opacity=".9">
  <path d="M490 360 Q520 510 680 640"/><path d="M490 345 Q740 150 1015 275"/>
  <path d="M490 350 Q1060 90 1500 490"/><path d="M490 350 Q1200 120 1760 395"/>
  <path d="M490 360 Q1230 510 1690 760"/>
</g>
<g fill="#ad4953"><circle cx="680" cy="640" r="11"/><circle cx="1015" cy="275" r="11"/><circle cx="1500" cy="490" r="11"/><circle cx="1760" cy="395" r="11"/><circle cx="1690" cy="760" r="11"/></g>
<g font-family="Arial,sans-serif" font-weight="700" text-anchor="middle">
  <circle cx="1195" cy="350" r="29" fill="#eea735" stroke="white" stroke-width="5"/><text x="1195" y="361" fill="#122c4c" font-size="30">1</text>
  <circle cx="480" cy="350" r="29" fill="#0d5f84" stroke="white" stroke-width="5"/><text x="480" y="361" fill="white" font-size="30">2</text>
</g>
'''

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 1001" role="img" aria-labelledby="title desc">
<title id="title">Turkey to United States, then selected global markets</title>
<desc id="desc">A geographic map derived from Natural Earth data. Number one marks Turkey and number two marks the United States. Dotted lines indicate possible later international expansion, not current operations.</desc>
<rect width="2000" height="1001" fill="#e8f2f7"/>
<g>{''.join(countries)}</g>
{routes}
</svg>'''
(assets / 'expansion-map.svg').write_text(svg, encoding='utf-8')
print('countries', len(paths), 'bytes', len(svg))
