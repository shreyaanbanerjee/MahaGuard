"""
Hybrid Document Ingestion Pipeline

Handles:
1. PDF type detection (text-based vs. scanned/image-only)
2. Text extraction with bounding boxes via PyMuPDF
3. OCR fallback via EasyOCR for scanned pages
4. Layout-aware section detection via unstructured
5. Semantic chunking by headers/clauses
6. Chunk persistence to Supabase with spatial metadata
"""
import uuid
import logging
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field

import fitz  # PyMuPDF
from db.supabase_client import get_supabase

logger = logging.getLogger(__name__)

# Minimum character count to consider a page "text-based" (not scanned)
TEXT_THRESHOLD = 50


@dataclass
class RawChunk:
    page_number: int       # 1-indexed
    bbox_x0: float
    bbox_y0: float
    bbox_x1: float
    bbox_y1: float
    raw_text: str
    section_type: str = "paragraph"    # header | paragraph | table | footer | unknown
    section_label: Optional[str] = None
    chunk_index: int = 0


def detect_pdf_type(pdf_path: str) -> dict:
    """
    Returns {'is_scanned': bool, 'page_count': int, 'scanned_pages': list[int]}
    Scanned pages = pages with < TEXT_THRESHOLD chars of extractable text.
    """
    doc = fitz.open(pdf_path)
    scanned_pages = []
    for i, page in enumerate(doc):
        text = page.get_text("text").strip()
        if len(text) < TEXT_THRESHOLD:
            scanned_pages.append(i + 1)  # 1-indexed

    doc.close()
    return {
        "is_scanned": len(scanned_pages) == doc.page_count,
        "page_count": doc.page_count,
        "scanned_pages": scanned_pages,
    }


def extract_text_chunks_pymupdf(pdf_path: str) -> list[RawChunk]:
    """
    Extracts text blocks with bounding boxes from text-based PDF pages.
    Each block becomes a raw chunk candidate.
    """
    doc = fitz.open(pdf_path)
    chunks: list[RawChunk] = []
    chunk_idx = 0

    for page_num_0 in range(doc.page_count):
        page = doc[page_num_0]
        page_num_1 = page_num_0 + 1
        blocks = page.get_text("blocks")  # (x0, y0, x1, y1, text, block_no, block_type)

        for block in blocks:
            x0, y0, x1, y1, text, block_no, block_type = block
            text = text.strip()
            if not text or len(text) < 10:
                continue

            # block_type 0 = text, 1 = image
            if block_type != 0:
                continue

            section_type = _classify_block(text, y0, page.rect.height)

            chunks.append(RawChunk(
                page_number=page_num_1,
                bbox_x0=round(x0, 2),
                bbox_y0=round(y0, 2),
                bbox_x1=round(x1, 2),
                bbox_y1=round(y1, 2),
                raw_text=text,
                section_type=section_type,
                chunk_index=chunk_idx,
            ))
            chunk_idx += 1

    doc.close()
    return chunks


def extract_text_chunks_ocr(pdf_path: str, scanned_pages: list[int]) -> list[RawChunk]:
    """
    Uses EasyOCR to extract text + bounding boxes from scanned pages.
    Renders each page to an image then runs OCR.
    """
    try:
        import easyocr
        import numpy as np
        from PIL import Image
    except ImportError:
        logger.error("EasyOCR or Pillow not installed. Cannot process scanned pages.")
        return []

    reader = easyocr.Reader(["en"], gpu=False)
    doc = fitz.open(pdf_path)
    chunks: list[RawChunk] = []
    chunk_idx = 0

    for page_num_1 in scanned_pages:
        page = doc[page_num_1 - 1]
        # Render at 200 DPI for good OCR quality
        mat = fitz.Matrix(200 / 72, 200 / 72)
        pix = page.get_pixmap(matrix=mat)
        img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)

        results = reader.readtext(img_array)
        scale_x = page.rect.width / pix.width
        scale_y = page.rect.height / pix.height

        for bbox_pts, text, confidence in results:
            if confidence < 0.3 or not text.strip():
                continue

            # bbox_pts = [[x1,y1],[x2,y2],[x3,y3],[x4,y4]] (top-left clockwise)
            xs = [p[0] for p in bbox_pts]
            ys = [p[1] for p in bbox_pts]
            x0 = min(xs) * scale_x
            y0 = min(ys) * scale_y
            x1 = max(xs) * scale_x
            y1 = max(ys) * scale_y

            chunks.append(RawChunk(
                page_number=page_num_1,
                bbox_x0=round(x0, 2),
                bbox_y0=round(y0, 2),
                bbox_x1=round(x1, 2),
                bbox_y1=round(y1, 2),
                raw_text=text.strip(),
                section_type="paragraph",
                chunk_index=chunk_idx,
            ))
            chunk_idx += 1

    doc.close()
    return chunks


def semantic_merge_chunks(raw_chunks: list[RawChunk]) -> list[RawChunk]:
    """
    Merges adjacent small chunks under the same detected header/section.
    Groups blocks by proximity on the same page to form coherent clause-level chunks.
    Target: ~300-800 tokens per merged chunk.
    """
    if not raw_chunks:
        return []

    merged: list[RawChunk] = []
    buffer: list[RawChunk] = [raw_chunks[0]]
    current_label: Optional[str] = None

    for chunk in raw_chunks[1:]:
        prev = buffer[-1]
        same_page = chunk.page_number == prev.page_number
        close_vertically = same_page and (chunk.bbox_y0 - prev.bbox_y1) < 30
        buffer_word_count = sum(len(c.raw_text.split()) for c in buffer)
        is_new_header = chunk.section_type == "header"

        if is_new_header or not close_vertically or buffer_word_count > 200:
            # Flush buffer
            merged.append(_flush_buffer(buffer, current_label))
            buffer = [chunk]
            current_label = chunk.raw_text[:80] if is_new_header else current_label
        else:
            buffer.append(chunk)

    if buffer:
        merged.append(_flush_buffer(buffer, current_label))

    # Re-index
    for i, c in enumerate(merged):
        c.chunk_index = i

    return merged


def _flush_buffer(buffer: list[RawChunk], label: Optional[str]) -> RawChunk:
    combined_text = " ".join(c.raw_text for c in buffer)
    first = buffer[0]
    last = buffer[-1]
    section_type = first.section_type if len(buffer) == 1 else "paragraph"
    return RawChunk(
        page_number=first.page_number,
        bbox_x0=min(c.bbox_x0 for c in buffer),
        bbox_y0=first.bbox_y0,
        bbox_x1=max(c.bbox_x1 for c in buffer),
        bbox_y1=last.bbox_y1,
        raw_text=combined_text.strip(),
        section_type=section_type,
        section_label=label,
        chunk_index=0,  # will be re-assigned
    )


def _classify_block(text: str, y0: float, page_height: float) -> str:
    """Heuristic block classifier based on text length and position."""
    words = text.split()
    # Short text near top or with all-caps → likely header
    if len(words) <= 8 and (text.isupper() or text.istitle() or y0 < page_height * 0.15):
        return "header"
    # Footer heuristic: very short, near bottom
    if len(words) <= 6 and y0 > page_height * 0.88:
        return "footer"
    # Table heuristic: many tab/pipe characters or numeric-dense
    if text.count("\t") > 3 or text.count("|") > 3:
        return "table"
    return "paragraph"


async def persist_chunks(
    task_id: str,
    document_id: str,
    chunks: list[RawChunk],
) -> list[str]:
    """
    Saves all chunks to Supabase. Returns list of inserted chunk UUIDs.
    Embeddings are stored separately after embedding generation.
    """
    sb = get_supabase()
    chunk_ids: list[str] = []

    rows = [
        {
            "id": str(uuid.uuid4()),
            "document_id": document_id,
            "task_id": task_id,
            "page_number": c.page_number,
            "bbox_x0": c.bbox_x0,
            "bbox_y0": c.bbox_y0,
            "bbox_x1": c.bbox_x1,
            "bbox_y1": c.bbox_y1,
            "raw_text": c.raw_text,
            "section_type": c.section_type,
            "section_label": c.section_label,
            "chunk_index": c.chunk_index,
        }
        for c in chunks
    ]

    result = sb.table("chunks").insert(rows).execute()
    chunk_ids = [row["id"] for row in result.data]
    logger.info(f"Persisted {len(chunk_ids)} chunks for task {task_id}")
    return chunk_ids
