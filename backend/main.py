import asyncio
from contextlib import asynccontextmanager
import httpx
from fastapi.responses import JSONResponse
from supabase.lib.client_options import SyncClientOptions
from supabase_http import create_supabase_http_client
import logging
import os
from pathlib import Path
from fastapi import Request
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from postgrest.exceptions import APIError
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from supabase import create_client
from supabase_auth.errors import AuthApiError
from fastapi import File, Form, UploadFile
from uuid import uuid4
from typing import Literal

# Load backend/.env
load_dotenv(Path(__file__).with_name(".env"))

logger = logging.getLogger(__name__)

supabase_http_client = create_supabase_http_client()

@asynccontextmanager
async def lifespan(app: FastAPI):
    stop = asyncio.Event()
    worker = asyncio.create_task(storage_cleanup_worker(stop))
    try:
        yield
    finally:
        stop.set()
        await worker
        supabase_http_client.close()

app = FastAPI(title="Venus Client Portal", lifespan=lifespan)

@app.exception_handler(httpx.RequestError)
async def upstream_network_error(request: Request, exc: httpx.RequestError):
    # Never log upstream URLs, secrets, or customer payloads.
    logger.warning("Supabase connection failed (%s)", type(exc).__name__)
    read = request.method in {"GET", "HEAD"} or request.url.path.endswith(("/list", "/search", "/download", "/customer-dashboard"))
    detail = ("The database connection was interrupted. Please refresh and try again." if read else
              "The connection was interrupted and the result could not be confirmed. Refresh and check whether your change was saved before submitting it again.")
    return JSONResponse(status_code=503, content={"detail": detail})


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
    options=SyncClientOptions(httpx_client=supabase_http_client),
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
                detail="This customer code or email is already in use.",
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
        default="Not provided",
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
    view: Literal["active", "completed", "archive"] = "active",
):
    try:
        query = (
            supabase.table("sales_orders")
            .select(
                "*, customers(id, code, name), sales_order_items(*)",
                count="exact",
            )
        )

        if view == "archive":
            query = query.not_.is_("archived_at", "null")
        else:
            query = query.is_("archived_at", "null")
            query = query.eq("order_status", "Completed") if view == "completed" else query.neq("order_status", "Completed")

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

class TestCustomerLogin(BaseModel):
    email: EmailStr
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=12, ge=1, le=100)


@app.post("/dev/customer-dashboard")
def test_customer_dashboard(
    payload: TestCustomerLogin,
    request: Request,
):
    # Local testing only. Do not enable behind a production proxy.
    enabled = (
        os.getenv("ENABLE_TEST_EMAIL_LOGIN", "").lower() == "true"
    )

    local_request = (
        request.client is not None
        and request.client.host in {"127.0.0.1", "::1"}
    )

    if not enabled or not local_request:
        raise HTTPException(status_code=404, detail="Not found.")

    email = str(payload.email).strip().lower()

    # Escape SQL LIKE wildcards so matching is case-insensitive
    # but still matches the complete email address.
    email_pattern = (
        email.replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )

    try:
        customers_result = (
            supabase.table("customers")
            .select("id, code, name, email, city")
            .ilike("email", email_pattern)
            .limit(2)
            .execute()
        )

        if not customers_result.data:
            raise HTTPException(
                status_code=403,
                detail="This email is not registered. Contact Venus Wires.",
            )

        if len(customers_result.data) > 1:
            raise HTTPException(
                status_code=409,
                detail=(
                    "This email belongs to multiple companies. "
                    "Ask the administrator to use a unique email."
                ),
            )

        company = customers_result.data[0]

        orders_result = (
            supabase.table("sales_orders")
            .select("*, sales_order_items(*)", count="exact")
            .is_("archived_at", "null")
            .eq("customer_id", company["id"])
            .order("created_at", desc=True)
            .order("id", desc=True)
            .range(
                payload.offset,
                payload.offset + payload.limit - 1,
            )
            .execute()
        )

        return {
            "company": company,
            "orders": orders_result.data,
            "total": orders_result.count or 0,
        }

    except APIError:
        logger.exception("Unable to load test customer dashboard")
        raise HTTPException(
            status_code=503,
            detail="Unable to load your orders. Please try again.",
        )

# ---------- Order documents: local development ----------

MAX_DOCUMENT_BYTES = 50_000_000

DOCUMENT_FIELDS = (
    "id, order_id, name, original_filename, size_bytes, created_at"
)


class DocumentAccess(BaseModel):
    # Omitted by the local admin screen.
    # Supplied by the customer screen.
    email: EmailStr | None = None
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=20, ge=1, le=100)


def require_local_document_mode(request: Request):
    enabled = (
        os.getenv("ENABLE_TEST_EMAIL_LOGIN", "").strip().lower()
        == "true"
    )

    local = (
        request.client is not None
        and request.client.host in {"127.0.0.1", "::1"}
    )

    if not enabled or not local:
        raise HTTPException(status_code=404, detail="Not found.")


def document_bucket():
    bucket_name = os.getenv("SUPABASE_DOCUMENTS_BUCKET")

    if not bucket_name:
        raise HTTPException(
            status_code=503,
            detail="Document storage is not configured.",
        )

    try:
        bucket = supabase.storage.get_bucket(bucket_name)
    except Exception:
        logger.exception("Unable to access document bucket")
        raise HTTPException(
            status_code=503,
            detail="Document storage is unavailable.",
        )

    if bucket.public:
        raise HTTPException(
            status_code=503,
            detail="The document bucket must be private.",
        )

    return supabase.storage.from_(bucket_name)


def check_document_order(
    order_id: UUID,
    email: EmailStr | None,
):
    order_result = (
        supabase.table("sales_orders")
        .select("id, customer_id, archived_at")
        .eq("id", str(order_id))
        .limit(1)
        .execute()
    )

    if not order_result.data:
        raise HTTPException(status_code=404, detail="Order not found.")

    order = order_result.data[0]

    if email is not None and order_result.data[0].get("archived_at"):
        raise HTTPException(status_code=404, detail="Order not found.")

    if email is not None:
        normalized = str(email).strip().lower()
        pattern = (
            normalized.replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
        )

        result = (
            supabase.table("customers")
            .select("id")
            .ilike("email", pattern)
            .limit(2)
            .execute()
        )

        if (
            len(result.data) != 1
            or result.data[0]["id"] != order["customer_id"]
        ):
            raise HTTPException(
                status_code=403,
                detail="You cannot access documents for this order.",
            )

    return order


@app.post("/dev/orders/{order_id}/documents/list")
def list_order_documents(
    order_id: UUID,
    payload: DocumentAccess,
    request: Request,
):
    require_local_document_mode(request)

    try:
        check_document_order(order_id, payload.email)

        result = (
            supabase.table("order_documents")
            .select(DOCUMENT_FIELDS, count="exact")
            .eq("order_id", str(order_id))
            .order("created_at", desc=True)
            .order("id", desc=True)
            .range(payload.offset, payload.offset + payload.limit - 1)
            .execute()
        )

        return {
            "items": result.data,
            "total": result.count or 0,
        }

    except APIError:
        logger.exception("Unable to list order documents")
        raise HTTPException(
            status_code=503,
            detail="Unable to load documents. Please try again.",
        )


@app.post("/dev/orders/{order_id}/documents", status_code=201)
def upload_order_document(
    order_id: UUID,
    request: Request,
    name: str = Form(..., min_length=1, max_length=150),
    file: UploadFile = File(...),
):
    require_local_document_mode(request)

    clean_name = name.strip()

    if not clean_name:
        raise HTTPException(
            status_code=422,
            detail="Enter a document name.",
        )

    # Measure the actual received file, not a client-supplied size.
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)

    if size == 0:
        raise HTTPException(
            status_code=422,
            detail="The selected file is empty.",
        )

    if size > MAX_DOCUMENT_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Each file must be 50 MB or smaller.",
        )

    try:
        order = check_document_order(order_id, None)
        if order.get("archived_at"):
            raise HTTPException(status_code=409, detail="Restore the order before uploading documents.")
    except APIError:
        logger.exception("Unable to check document order")
        raise HTTPException(
            status_code=503,
            detail="Unable to check this order.",
        )

    original_filename = (
        (file.filename or "document")
        .replace("\\", "/")
        .rsplit("/", 1)[-1]
    )

    # Remove control characters from the download filename.
    original_filename = "".join(
        character
        for character in original_filename
        if character.isprintable()
    ).strip()[:240] or "document"

    document_id = str(uuid4())
    storage_path = f"{order_id}/{document_id}"
    bucket = document_bucket()

    try:
        # Byte uploads are supported by the installed Storage SDK.
        # Maximum memory used here is bounded by the 50 MB check.
        content = file.file.read(MAX_DOCUMENT_BYTES + 1)

        if len(content) != size:
            raise HTTPException(
                status_code=422,
                detail="Unable to read the complete file.",
            )

        bucket.upload(
            path=storage_path,
            file=content,
            file_options={
                "content-type": "application/octet-stream",
                "cache-control": "0",
                "upsert": "false",
            },
        )

    except HTTPException:
        raise
    except Exception:
        logger.exception("Document upload failed: %s", document_id)
        raise HTTPException(
            status_code=503,
            detail="Upload failed. Please try again.",
        )
    finally:
        file.file.close()

    record = {
        "id": document_id,
        "order_id": str(order_id),
        "name": clean_name,
        "original_filename": original_filename,
        "storage_path": storage_path,
        "size_bytes": size,
    }

    try:
        supabase.table("order_documents").insert(record).execute()

    except APIError:
        # A rejected insert means the uploaded object has no metadata.
        logger.exception("Document metadata rejected: %s", document_id)

        try:
            bucket.remove([storage_path])
        except Exception:
            logger.exception(
                "Orphan file requires cleanup: %s",
                storage_path,
            )

        raise HTTPException(
            status_code=503,
            detail="Unable to save the document details. Please try again.",
        )

    except Exception:
        # A connection failure can leave the insert outcome uncertain.
        # Keep the object rather than deleting a potentially saved file.
        logger.exception(
            "Document save outcome uncertain: %s",
            document_id,
        )
        raise HTTPException(
            status_code=503,
            detail=(
                "Upload result could not be confirmed. "
                "Refresh the document list before retrying."
            ),
        )

    return {"id": document_id, "message": "Document uploaded."}


@app.post("/dev/orders/{order_id}/documents/{document_id}/download")
def download_order_document(
    order_id: UUID,
    document_id: UUID,
    payload: DocumentAccess,
    request: Request,
):
    require_local_document_mode(request)

    try:
        check_document_order(order_id, payload.email)

        result = (
            supabase.table("order_documents")
            .select("storage_path, original_filename")
            .eq("id", str(document_id))
            .eq("order_id", str(order_id))
            .limit(1)
            .execute()
        )

    except APIError:
        logger.exception("Unable to load document")
        raise HTTPException(
            status_code=503,
            detail="Unable to load the document.",
        )

    if not result.data:
        raise HTTPException(
            status_code=404,
            detail="Document not found.",
        )

    document = result.data[0]
    bucket = document_bucket()

    try:
        result = bucket.create_signed_url(
            document["storage_path"],
            60,
            options={
                "download": document["original_filename"],
            },
        )

        return {"url": result["signedURL"]}

    except Exception:
        logger.exception("Unable to create document download")
        raise HTTPException(
            status_code=503,
            detail="Unable to download this file. Please try again.",
        )

# ---------- Edit an existing order ----------

class OrderItemUpdate(OrderItemCreate):
    id: UUID


class SalesOrderUpdate(SalesOrderCreate):
    expected_version: int = Field(ge=1)
    items: list[OrderItemUpdate] = Field(
        min_length=1,
        max_length=100,
    )

    @model_validator(mode="after")
    def validate_item_ids(self):
        item_ids = [item.id for item in self.items]

        if len(item_ids) != len(set(item_ids)):
            raise ValueError("Each order item must appear exactly once.")

        return self


@app.post("/dev/orders/{order_id}/edit")
def edit_sales_order(
    order_id: UUID,
    payload: SalesOrderUpdate,
    request: Request,
):
    # Matches the portal's current local-development access model.
    enabled = (
        os.getenv("ENABLE_TEST_EMAIL_LOGIN", "").strip().lower()
        == "true"
    )

    local_request = (
        request.client is not None
        and request.client.host in {"127.0.0.1", "::1"}
    )

    if not enabled or not local_request:
        raise HTTPException(status_code=404, detail="Not found.")

    try:
        result = (
            supabase.rpc(
                "update_sales_order",
                {
                    "p_order_id": str(order_id),
                    "p_expected_version": payload.expected_version,
                    "p_payload": payload.model_dump(
                        mode="json",
                        exclude={"expected_version"},
                    ),
                },
            )
            .execute()
        )

        return result.data

    except APIError as exc:
        if exc.code == "P0002":
            raise HTTPException(
                status_code=404,
                detail="This order no longer exists.",
            )

        if exc.code == "40001":
            raise HTTPException(
                status_code=409,
                detail=(
                    "This order changed after you opened it. "
                    "Close the form, refresh the orders list, "
                    "and reopen the order before editing again."
                ),
            )

        if exc.code == "23505":
            raise HTTPException(
                status_code=409,
                detail="This sales order number already exists.",
            )

        if exc.code in {
            "22023",
            "23514",
            "22003",
            "22P02",
            "22007",
            "22008",
            "23502",
        }:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Check the order fields, dates and quantities. "
                    "The company and existing SO-item numbers "
                    "cannot be changed."
                ),
            )

        logger.exception("Failed to update order")
        raise HTTPException(
            status_code=503,
            detail="Unable to update the order. Please try again.",
        )

# ---------- Documents sidebar page ----------

class DocumentSearch(BaseModel):
    email: EmailStr | None = None
    search: str = Field(default="", max_length=150)
    order_number: str = Field(default="", max_length=100)
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=20, ge=1, le=100)


@app.post("/dev/documents/search")
def search_documents(
    payload: DocumentSearch,
    request: Request,
):
    require_local_document_mode(request)

    customer_id = None

    try:
        if payload.email is not None:
            normalized = str(payload.email).strip().lower()

            email_pattern = (
                normalized.replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_")
            )

            result = (
                supabase.table("customers")
                .select("id")
                .ilike("email", email_pattern)
                .limit(2)
                .execute()
            )

            if len(result.data) != 1:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "Your email must be registered "
                        "against exactly one company."
                    ),
                )

            customer_id = result.data[0]["id"]

        result = (
            supabase.rpc(
                "search_order_documents_v2",
                {
                    "p_customer_id": customer_id,
                    "p_search": payload.search.strip(),
                    "p_order_number": payload.order_number.strip(),
                    "p_offset": payload.offset,
                    "p_limit": payload.limit,
                },
            )
            .execute()
        )

        return result.data

    except APIError:
        logger.exception("Unable to search documents")
        raise HTTPException(
            status_code=503,
            detail="Unable to load documents. Please try again.",
        )

@app.get("/dev/admin/dashboard")
def admin_dashboard(request: Request):
    require_local_document_mode(request)

    try:
        result = supabase.rpc("get_admin_dashboard_v2").execute()
        return result.data

    except APIError:
        logger.exception("Unable to load admin dashboard")
        raise HTTPException(
            status_code=503,
            detail="Unable to load the dashboard. Please try again.",
        )


@app.get("/dev/admin/sales-history")
def admin_sales_history(request: Request):
    require_local_document_mode(request)
    from datetime import datetime
    from zoneinfo import ZoneInfo
    today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    current = today.year * 12 + today.month - 1
    months = {}
    for index in range(current - 11, current + 1):
        year, month = divmod(index, 12)
        key = f"{year:04d}-{month + 1:02d}"
        months[key] = {"month": key, "quantity": Decimal("0"), "orders": 0}
    try:
        offset = 0
        while True:
            rows = (supabase.table("sales_orders")
                .select("id,so_create_date,order_status,sales_order_items(order_qty_lbs)")
                .is_("archived_at", "null")
                .gte("so_create_date", next(iter(months)) + "-01")
                .lte("so_create_date", today.isoformat())
                .order("id").range(offset, offset + 99).execute()).data
            for order in rows:
                if str(order.get("order_status") or "").strip().lower() in {"cancelled", "canceled"}:
                    continue
                key = str(order.get("so_create_date") or "")[:7]
                if key in months:
                    months[key]["orders"] += 1
                    months[key]["quantity"] += sum((Decimal(str(item.get("order_qty_lbs") or 0)) for item in order.get("sales_order_items", [])), Decimal("0"))
            if len(rows) < 100:
                break
            offset += 100
        return {"months": [{**month, "quantity": float(month["quantity"])} for month in months.values()]}
    except APIError:
        raise HTTPException(status_code=503, detail="Unable to load sales history.")


@app.get("/dev/admin/destinations")
def admin_destinations(request: Request):
    require_local_document_mode(request)
    try:
        # Read destinations across all active orders, not just the recent five.
        destinations = []
        offset = 0
        page_size = 100
        while True:
            page = (
                supabase.table("sales_orders")
                .select("country")
                .is_("archived_at", "null")
                .neq("order_status", "Completed")
                .order("id")
                .range(offset, offset + page_size - 1)
                .execute()
            ).data
            destinations.extend(page)
            if len(page) < page_size:
                break
            offset += page_size
        return {"items": destinations}

    except APIError:
        raise HTTPException(status_code=503, detail="Unable to load destinations. Please retry.")


# ---------- Edit customer ----------

class CustomerUpdate(CustomerCreate):
    expected_version: int = Field(ge=1)


@app.post("/dev/customers/{customer_id}/edit")
def edit_customer(
    customer_id: UUID,
    payload: CustomerUpdate,
    request: Request,
):
    # Reuse the current local-development restriction.
    require_local_document_mode(request)

    values = payload.model_dump(
        mode="json",
        exclude={"expected_version"},
    )

    values["email"] = values["email"].strip().lower()

    try:
        result = (
            supabase.table("customers")
            .update(values)
            .eq("id", str(customer_id))
            .eq("edit_version", payload.expected_version)
            .execute()
        )

        if not result.data:
            existing = (
                supabase.table("customers")
                .select("id")
                .eq("id", str(customer_id))
                .limit(1)
                .execute()
            )

            if not existing.data:
                raise HTTPException(
                    status_code=404,
                    detail="This customer no longer exists.",
                )

            raise HTTPException(
                status_code=409,
                detail=(
                    "This customer changed after you opened the form. "
                    "Close the form, refresh the list, and edit again."
                ),
            )

        return result.data[0]

    except APIError as exc:
        if exc.code == "23505":
            raise HTTPException(
                status_code=409,
                detail="This customer code or email is already in use.",
            )

        logger.exception("Unable to update customer")
        raise HTTPException(
            status_code=503,
            detail="Unable to update the customer. Please try again.",
        )



# ---------- Inventory: local admin testing ----------

InventoryProduct = Literal[
    "Coarse Wires",
    "Fine Wires",
    "Wire Rod",
    "Free Machining Wire",
    "Cold Heading Wire",
    "TIG Wires",
    "MIG Wires",
    "Core Wires",
    "Sub Arc Welding Wires",
    "Profiles",
    "Round Bars",
    "HEX and Square Bars",
    "VSQ Bars",
    "Fitmach Bars",
    "Tru-Tuf Bars",
    "Solo Bar",
]


class InventoryItemCreate(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    product: InventoryProduct
    grade: str = Field(min_length=1, max_length=100)
    size: str = Field(min_length=1, max_length=100)
    location: str = Field(min_length=1, max_length=150)


class InventoryMovementCreate(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    request_id: UUID
    direction: Literal["IN", "OUT"]
    quantity: Decimal = Field(
        gt=0,
        le=1_000_000_000,
        max_digits=13,
        decimal_places=3,
        allow_inf_nan=False,
    )
    unit: Literal["KG", "LBS"]
    reason: str = Field(min_length=1, max_length=500)


def inventory_error(exc: APIError):
    if exc.code == "P0002":
        return HTTPException(
            status_code=404,
            detail="Inventory item not found.",
        )

    if exc.code == "23505":
        return HTTPException(
            status_code=409,
            detail=(
                "This stock entry or movement already exists. "
                "Refresh the list before retrying."
            ),
        )

    if exc.code == "23514":
        return HTTPException(
            status_code=422,
            detail="The movement would produce an invalid stock balance.",
        )

    if exc.code in {"22023", "22003", "22P02"}:
        return HTTPException(
            status_code=422,
            detail=(
                "Check the quantity and movement details. "
                "If a previous attempt may have succeeded, "
                "check History before submitting another movement."
            ),
        )

    return HTTPException(
        status_code=503,
        detail="Inventory is unavailable. Please try again.",
    )


@app.get("/dev/inventory")
def list_inventory(
    request: Request,
    q: str = Query(default="", max_length=150),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
):
    require_local_document_mode(request)

    try:
        query = supabase.table("inventory_items").select(
            "id, product, grade, size, location, quantity_kg, updated_at",
            count="exact",
        )

        if q.strip():
            term = (
                q.strip()
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_")
            )
            query = query.ilike("search_text", f"%{term}%")

        result = (
            query
            .order("product")
            .order("grade")
            .order("size")
            .order("id")
            .range(offset, offset + limit - 1)
            .execute()
        )

        return {"items": result.data, "total": result.count or 0}

    except APIError as exc:
        logger.exception("Unable to load inventory")
        raise inventory_error(exc)


@app.post("/dev/inventory", status_code=201)
def create_inventory_item(
    payload: InventoryItemCreate,
    request: Request,
):
    require_local_document_mode(request)

    try:
        result = (
            supabase.table("inventory_items")
            .insert(payload.model_dump())
            .execute()
        )
        return result.data[0]

    except APIError as exc:
        logger.exception("Unable to create inventory item")
        raise inventory_error(exc)


@app.post("/dev/inventory/{item_id}/movements")
def record_stock_movement(
    item_id: UUID,
    payload: InventoryMovementCreate,
    request: Request,
):
    require_local_document_mode(request)

    try:
        result = (
            supabase.rpc(
                "record_inventory_movement",
                {
                    "p_item_id": str(item_id),
                    "p_request_id": str(payload.request_id),
                    "p_direction": payload.direction,
                    # Send decimal text rather than a binary float.
                    "p_quantity": str(payload.quantity),
                    "p_unit": payload.unit,
                    "p_reason": payload.reason,
                },
            )
            .execute()
        )
        return result.data

    except APIError as exc:
        logger.exception("Unable to record stock movement")
        raise inventory_error(exc)


@app.get("/dev/inventory/{item_id}/movements")
def inventory_history(
    item_id: UUID,
    request: Request,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
):
    require_local_document_mode(request)

    try:
        result = (
            supabase.table("inventory_movements")
            .select("*", count="exact")
            .eq("item_id", str(item_id))
            .order("created_at", desc=True)
            .order("id", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )

        return {"items": result.data, "total": result.count or 0}

    except APIError as exc:
        logger.exception("Unable to load stock history")
        raise inventory_error(exc)



class OrderLifecycleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["status", "archive", "restore"]
    status: str = Field(default="Pending", min_length=1, max_length=80)
    confirmation: str = Field(default="", max_length=80)
    expected_version: int = Field(ge=1)

@app.post("/dev/orders/{order_id}/lifecycle")
def update_order_lifecycle(order_id: UUID, payload: OrderLifecycleUpdate, request: Request):
    require_local_document_mode(request)
    try:
        return supabase.rpc("change_order_lifecycle", {
            "p_id": str(order_id), "p_version": payload.expected_version,
            "p_action": payload.action, "p_status": payload.status,
            "p_confirmation": payload.confirmation,
        }).execute().data
    except APIError as exc:
        if exc.code in {"22023", "40001", "P0002"}:
            raise HTTPException(status_code=409 if exc.code == "40001" else 422, detail=exc.message)
        logger.exception("Unable to update order lifecycle")
        raise HTTPException(status_code=503, detail="Unable to update order. Confirm the lifecycle SQL migration has been applied.")


# Permanent deletion functions are installed by the supplied Supabase SQL.
class DestructiveConfirmation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirmation: str = Field(max_length=80)

class DocumentRename(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=150)

def mutation_rpc(name: str, parameters: dict):
    try:
        return supabase.rpc(name, parameters).execute().data
    except APIError as exc:
        if exc.code == "P0002":
            raise HTTPException(status_code=404, detail="Record not found. Refresh the page.")
        if exc.code == "22023":
            raise HTTPException(status_code=422, detail=exc.message)
        if exc.code == "23503":
            raise HTTPException(status_code=409, detail="Other linked records prevented deletion. Nothing was deleted.")
        if exc.code == "PGRST202":
            raise HTTPException(status_code=503, detail="Apply the customer/document deletion SQL in Supabase first.")
        logger.warning("Deletion/rename RPC failed (%s)", exc.code)
        raise HTTPException(status_code=503, detail="Unable to complete this operation. Refresh before retrying.")

@app.post("/dev/customers/{customer_id}/delete")
def delete_customer(customer_id: UUID, payload: DestructiveConfirmation, request: Request):
    require_local_document_mode(request)
    if payload.confirmation != "Delete customer":
        raise HTTPException(status_code=422, detail="Type Delete customer exactly to confirm.")
    return mutation_rpc("delete_customer_permanently", {
        "p_customer_id": str(customer_id), "p_confirmation": payload.confirmation,
    })

@app.post("/dev/documents/{document_id}/rename")
def rename_document(document_id: UUID, payload: DocumentRename, request: Request):
    require_local_document_mode(request)
    return mutation_rpc("rename_order_document", {"p_document_id": str(document_id), "p_name": payload.name})

@app.post("/dev/documents/{document_id}/delete")
def delete_document(document_id: UUID, payload: DestructiveConfirmation, request: Request):
    require_local_document_mode(request)
    if payload.confirmation != "Delete document":
        raise HTTPException(status_code=422, detail="Type Delete document exactly to confirm.")
    return mutation_rpc("delete_order_document", {"p_document_id": str(document_id), "p_confirmation": payload.confirmation})

def clean_pending_document_files():
    # Queue entries are acknowledged only after Storage confirms removal.
    rows = supabase.table("document_cleanup_queue").select("id,storage_path").order("created_at").limit(100).execute().data
    if not rows:
        return True
    bucket = document_bucket()
    for row in rows:
        try:
            bucket.remove([row["storage_path"]])
            supabase.table("document_cleanup_queue").delete().eq("id", row["id"]).execute()
        except Exception:
            return False
    return True

async def storage_cleanup_worker(stop: asyncio.Event):
    failures = 0
    while not stop.is_set():
        reason = "Storage removal failed"
        try:
            success = await asyncio.to_thread(clean_pending_document_files)
        except Exception as exc:
            success = False
            reason = type(exc).__name__
        if success:
            if failures:
                logger.info("Document cleanup connection recovered")
            failures = 0
        else:
            failures += 1
        delay = min(300, 30 * (2 ** min(failures, 4)))
        if failures == 1:
            logger.warning("Document cleanup deferred (%s). Queued files retained; retrying in %s seconds.", reason, delay)
        try:
            await asyncio.wait_for(stop.wait(), timeout=delay)
        except asyncio.TimeoutError:
            pass
