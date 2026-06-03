"""
Embedding generation + pgvector storage.
Uses Google's text-embedding-004 model (768 dimensions).
"""
import logging
import os
from typing import Optional
import google.generativeai as genai
from db.supabase_client import get_supabase

logger = logging.getLogger(__name__)

_EMBEDDING_MODEL = "models/text-embedding-004"
_BATCH_SIZE = 20  # Embed in batches to avoid rate limits


def _get_embedding(text: str) -> Optional[list[float]]:
    """Returns 768-dim embedding for a single text string."""
    try:
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        result = genai.embed_content(
            model=_EMBEDDING_MODEL,
            content=text,
            task_type="retrieval_document",
        )
        return result["embedding"]
    except Exception as e:
        logger.error(f"Embedding failed: {e}")
        return None


async def embed_and_store_chunks(task_id: str, chunk_ids: list[str], chunk_texts: list[str]) -> None:
    """
    Generates embeddings for all chunks and updates the Supabase rows.
    chunk_ids and chunk_texts must be the same length and order.
    """
    sb = get_supabase()
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])

    for i in range(0, len(chunk_ids), _BATCH_SIZE):
        batch_ids = chunk_ids[i:i + _BATCH_SIZE]
        batch_texts = chunk_texts[i:i + _BATCH_SIZE]

        for chunk_id, text in zip(batch_ids, batch_texts):
            embedding = _get_embedding(text)
            if embedding:
                sb.table("chunks").update({"embedding": embedding}).eq("id", chunk_id).execute()

    logger.info(f"Embeddings stored for {len(chunk_ids)} chunks — task {task_id}")


def embed_query(query_text: str) -> Optional[list[float]]:
    """Returns embedding for a retrieval query (used by RAG retriever)."""
    try:
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        result = genai.embed_content(
            model=_EMBEDDING_MODEL,
            content=query_text,
            task_type="retrieval_query",
        )
        return result["embedding"]
    except Exception as e:
        logger.error(f"Query embedding failed: {e}")
        return None
