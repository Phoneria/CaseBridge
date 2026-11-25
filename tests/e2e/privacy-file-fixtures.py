"""Generate only fictional documents for privacy-file browser checks."""
import io
import sys
from pathlib import Path
from docx import Document
from PIL import Image, ImageDraw
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.utils import ImageReader

out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
text='Davalı Mehmet YILMAZ, sentetik@example.test, 0532 123 45 67 Ankara.'
(out/'sample.txt').write_text(text,encoding='utf-8')
(out/'other.xyz').write_text(text,encoding='utf-8')
doc=Document();doc.add_paragraph(text);doc.add_table(rows=1,cols=1).cell(0,0).text='tablo@example.test';doc.sections[0].header.paragraphs[0].text='ustbilgi@example.test';doc.save(out/'sample.docx')
pdf=Canvas(str(out/'sample.pdf'));pdf.drawString(30,700,'Synthetic sentetik@example.test 0532 123 45 67');pdf.save()
image=Image.new('RGB',(400,100),'white');ImageDraw.Draw(image).text((10,10),'Synthetic image-only document',fill='black')
pdf=Canvas(str(out/'scanned.pdf'));pdf.drawImage(ImageReader(image),30,600,width=400,height=100);pdf.save()
(out/'binary.bin').write_bytes(b'\x89PNG\r\n\x1a\n\x00synthetic')
print('Generated six synthetic privacy fixtures')
