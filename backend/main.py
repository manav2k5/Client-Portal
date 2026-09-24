import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import create_client
from supabase_auth.errors import AuthApiError

load_dotenv(Path(__file__).with_name(".env"))

app = FastAPI(title="Venus Client Portal")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["Content-Type", "Authorization"],
)

supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SECRET_KEY"],
)

bearer = HTTPBearer()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/me")
def get_me(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
):
    try:
        result = supabase.auth.get_user(credentials.credentials)
    except AuthApiError:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired login",
        )

    if result.user is None:
        raise HTTPException(status_code=401, detail="Invalid login")

    return {"id": result.user.id, "email": result.user.email}
