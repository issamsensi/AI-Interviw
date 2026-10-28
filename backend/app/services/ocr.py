import io
import logging

import pdfplumber
import pytesseract
from PIL import Image

logger = logging.getLogger(__name__)


async def extract_text_from_pdf(file_bytes: bytes) -> str:
    text = ""
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                text += page_text + "\n"
    except Exception as e:
        logger.error(f"pdfplumber failed: {e}, falling back to PyMuPDF")
        try:
            import fitz
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            for page in doc:
                text += page.get_text() + "\n"
        except Exception as e2:
            logger.error(f"PyMuPDF also failed: {e2}")
    return text.strip()


async def extract_text_from_image(file_bytes: bytes) -> str:
    try:
        image = Image.open(io.BytesIO(file_bytes))
        text = pytesseract.image_to_string(image)
        return text.strip()
    except Exception as e:
        logger.error(f"OCR extraction failed: {e}")
        return ""


async def extract_text(file_bytes: bytes, filename: str) -> str:
    extension = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension == ".pdf":
        return await extract_text_from_pdf(file_bytes)
    if extension in {".png", ".jpg", ".jpeg"}:
        return await extract_text_from_image(file_bytes)
    return ""
