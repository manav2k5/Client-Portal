import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from postgrest.exceptions import APIError
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from supabase import create_client
from supabase_auth.errors import AuthApiError

# Load backend/.env
load_dotenv(Path(__file__).with_name(".env"))

logger = logging.getLogger(__name__)

app = FastAPI(title="Venus Client Portal")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)

supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SECRET_KEY"],
)

bearer = HTTPBearer(auto_error=False)


# ---------- Customer form validation ----------

class CustomerCreate(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    code: str = Field(
        min_length=2,
        max_length=30,
        pattern=r"^[A-Z0-9-]{2,30}$",
    )
    name: str = Field(min_length=1, max_length=150)
    contact: str = Field(min_length=1, max_length=100)
    email: EmailStr
    phone: str = Field(default="", max_length=30)
    city: str = Field(min_length=1, max_length=100)
    address: str = Field(default="", max_length=500)


# ---------- Health check ----------

@app.get("/health")
def health():
    return {"status": "ok"}


# ---------- Existing login verification ----------

@app.get("/me")
def get_me(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
):
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Please sign in.",
        )

    try:
        result = supabase.auth.get_user(credentials.credentials)
    except AuthApiError:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired login.",
        )

    if result.user is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid login.",
        )

    return {
        "id": result.user.id,
        "email": result.user.email,
    }


# ---------- Get saved customers ----------
# No login required during local development.

@app.get("/customers")
def list_customers(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=12, ge=1, le=100),
):
    try:
        result = (
            supabase.table("customers")
            .select("*", count="exact")
            .order("created_at", desc=True)
            .order("id", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
    except APIError:
        logger.exception("Failed to load customers")
        raise HTTPException(
            status_code=503,
            detail="Unable to load customers. Please try again.",
        )

    return {
        "items": result.data,
        "total": result.count or 0,
    }


# ---------- Save a new customer ----------
# No login required during local development.

@app.post("/customers", status_code=201)
def create_customer(payload: CustomerCreate):
    customer_data = payload.model_dump(mode="json")

    try:
        result = (
            supabase.table("customers")
            .insert(customer_data)
            .execute()
        )
    except APIError as exc:
        if exc.code == "23505":
            raise HTTPException(
                status_code=409,
                detail="This customer code already exists.",
            )

        logger.exception("Failed to save customer")
        raise HTTPException(
            status_code=503,
            detail="Unable to save customer. Please try again.",
        )

    return result.data[0]
from datetime import date
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import model_validator


Quantity = Annotated[
    Decimal,
    Field(
        ge=0,
        max_digits=18,
        decimal_places=3,
        allow_inf_nan=False,
    ),
]

Dimension = Annotated[
    Decimal,
    Field(
        gt=0,
        max_digits=18,
        decimal_places=6,
        allow_inf_nan=False,
    ),
]


class OrderItemCreate(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    so_item: str = Field(min_length=1, max_length=30)
    finish_size_mm: Dimension | None = None
    finish_size_inch: Dimension | None = None

    shape: str = Field(default="", max_length=80)
    size_tolerance: str = Field(default="", max_length=100)
    customer_grade: str = Field(default="", max_length=100)
    fg_length: str = Field(default="", max_length=100)
    ht_condition: str = Field(default="", max_length=100)

    order_qty_lbs: Quantity = Field(gt=0)
    dispatched_qty_lbs: Quantity = Decimal("0")
    packed_qty_lbs: Quantity = Decimal("0")
    wip_qty_lbs: Quantity = Decimal("0")
    rm_po_qty_lbs: Quantity = Decimal("0")

    current_status: str = Field(
        default="Processing",
        min_length=1,
        max_length=100,
    )
    remark: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def validate_quantities(self):
        if self.dispatched_qty_lbs > self.order_qty_lbs:
            raise ValueError(
                "Dispatched quantity cannot exceed ordered quantity."
            )
        return self


class SalesOrderCreate(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    customer_id: UUID
    country: str = Field(min_length=1, max_length=100)
    port_of_discharge: str = Field(default="", max_length=150)
    customer_po_no: str = Field(default="", max_length=100)
    customer_po_date: date | None = None
    customer_sort_name: str = Field(default="", max_length=150)

    sales_order_no: str = Field(min_length=1, max_length=100)
    fortis_sales_order: str = Field(default="", max_length=100)
    so_create_date: date
    oc_date: date | None = None

    items: list[OrderItemCreate] = Field(
        min_length=1,
        max_length=100,
    )

    @model_validator(mode="after")
    def validate_item_numbers(self):
        numbers = [item.so_item for item in self.items]

        if len(numbers) != len(set(numbers)):
            raise ValueError(
                "SO item numbers must be unique within an order."
            )

        return self


@app.get("/orders")
def list_orders(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=12, ge=1, le=100),
    q: str = Query(default="", max_length=100),
    customer_id: UUID | None = None,
):
    try:
        query = (
            supabase.table("sales_orders")
            .select(
                "*, customers(id, code, name), sales_order_items(*)",
                count="exact",
            )
        )

        if q.strip():
            # Search by sales order number.
            query = query.ilike("sales_order_no", f"%{q.strip()}%")

        if customer_id:
            query = query.eq("customer_id", str(customer_id))

        result = (
            query
            .order("created_at", desc=True)
            .order("id", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )

        return {
            "items": result.data,
            "total": result.count or 0,
        }

    except APIError:
        logger.exception("Failed to load orders")
        raise HTTPException(
            status_code=503,
            detail="Unable to load orders. Please try again.",
        )


@app.post("/orders", status_code=201)
def create_sales_order(payload: SalesOrderCreate):
    try:
        result = (
            supabase.rpc(
                "create_sales_order",
                {"payload": payload.model_dump(mode="json")},
            )
            .execute()
        )

        return {
            "id": result.data,
            "sales_order_no": payload.sales_order_no,
        }

    except APIError as exc:
        if exc.code == "23505":
            raise HTTPException(
                status_code=409,
                detail="This sales order number already exists.",
            )

        if exc.code == "23503":
            raise HTTPException(
                status_code=400,
                detail="The selected customer no longer exists.",
            )

        if exc.code in {"23514", "22003", "22P02", "22007"}:
            raise HTTPException(
                status_code=422,
                detail="Check the order dates and quantities.",
            )

        logger.exception("Failed to save order")
        raise HTTPException(
            status_code=503,
            detail="Unable to save order. Please try again.",
        )