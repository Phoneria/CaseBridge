"""Render the database preview as a downloadable Unicode PDF, without disk writes."""
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

pdfmetrics.registerFont(TTFont("Dossier", "Vera.ttf"))
pdfmetrics.registerFont(TTFont("DossierBold", "VeraBd.ttf"))
pdfmetrics.registerFont(TTFont("OlayYazisi", str(Path(__file__).with_name("fonts") / "Handlee-Regular.ttf")))


def render_dossier(text):
    out = BytesIO()
    sections = text.split("\n\n")
    pdf = SimpleDocTemplate(out, pagesize=A4, title=sections[0], author="CaseBridge · Kurgusal örnek",
                            leftMargin=46, rightMargin=46, topMargin=48, bottomMargin=45)
    story = []
    for index, paragraph in enumerate(sections):
        font = "DossierBold" if index == 0 else "Dossier"
        if sections[0] == "Müvekkilin kendi yazdığı olay özeti" and paragraph.startswith("Kendi anlatımım"):
            font = "OlayYazisi"
        style = ParagraphStyle("evrak", fontName=font, fontSize=17 if index == 0 else 10,
                               leading=22 if index == 0 else 15, textColor=HexColor("#18283a"))
        story.extend([Paragraph(escape(paragraph).replace("\n", "<br/>"), style), Spacer(1, 8)])

    def footer(canvas, doc):
        canvas.setFont("Dossier", 8)
        canvas.drawString(46, 25, f"CaseBridge · Kurgusal örnek     |     {doc.page}")

    pdf.build(story, onFirstPage=footer, onLaterPages=footer)
    return out.getvalue()
