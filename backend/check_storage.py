import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).with_name(".env"))

supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SECRET_KEY"],
)

bucket = supabase.storage.get_bucket(
    os.environ["SUPABASE_BUCKET"]
)

print(f"Connected to bucket: {bucket.name}")
print(f"Public: {bucket.public}")