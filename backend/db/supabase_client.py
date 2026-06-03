import os
from supabase import create_client, Client
from functools import lru_cache

@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """
    Returns a singleton Supabase client using the service role key.
    The service role key bypasses RLS — use only in the backend.
    """
    url: str = os.environ["SUPABASE_URL"]
    key: str = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)
