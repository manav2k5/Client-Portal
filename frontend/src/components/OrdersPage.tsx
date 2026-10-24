import OrderEta from "./OrderEta";
import OrderTray from "./OrderTray";
import OrderActions from "./OrderActions";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import Icon from "./Icon";
import Modal from "./Modal";
import OrderDocuments from "./OrderDocuments";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8001";
const PAGE_SIZE = 12;

type FieldDefinition = {
  key: string;
  label: string;
  type?: "text" | "date" | "number";
  required?: boolean;
  quantity?: boolean;
};

type Customer = {
  id: string;
  code: string;
  name: string;
};

type CellValue = string | number | null;

type SavedItem = {
  id: string;
  [key: string]: CellValue;
};

export type SavedOrder = {
  id: string;
  sales_order_no: string;
  customers: Customer | null;
  sales_order_items: SavedItem[];
  [key: string]: CellValue | Customer | SavedItem[];
  edit_version: number;
  updated_at: string | null;
};

type OrderList = {
  items: SavedOrder[];
  total: number;
};

type DraftItem = {
  localId: string;
  savedId?: string;
  values: Record<string, string>;
};

const headerFields: FieldDefinition[] = [
  {
    key: "country",
    label: "Destination (country, state or city)",
    required: true,
  },
  {
    key: "port_of_discharge",
    label: "Port of Discharge",
  },
  {
    key: "customer_po_no",
    label: "Cust. PO No.",
  },
  {
    key: "customer_po_date",
    label: "Cust. PO Date",
    type: "date",
  },
  {
    key: "customer_sort_name",
    label: "Customer Sort Name",
  },
  {
    key: "sales_order_no",
    label: "Sales Order No.",
    required: true,
  },
  {
    key: "fortis_sales_order",
    label: "Fortis Sales Order",
  },
  {
    key: "so_create_date",
    label: "SO Create Date",
    type: "date",
    required: true,
  },
  {
    key: "oc_date",
    label: "OC Date",
    type: "date",
  },
];

const itemFields: FieldDefinition[] = [
  {
    key: "so_item",
    label: "SO Item",
    required: true,
  },
  {
    key: "finish_size_mm",
    label: "Finish size (mm)",
    type: "number",
  },
  {
    key: "finish_size_inch",
    label: "Finish size (inch)",
    type: "number",
  },
  {
    key: "shape",
    label: "Shape",
  },
  {
    key: "size_tolerance",
    label: "Size Tol",
  },
  {
    key: "customer_grade",
    label: "Cust. Grade",
  },
  {
    key: "fg_length",
    label: "FG Length (include unit)",
  },
  {
    key: "ht_condition",
    label: "HT Cond.",
  },
  {
    key: "order_qty_lbs",
    label: "Order Qty (LBS)",
    type: "number",
    required: true,
    quantity: true,
  },
  {
    key: "dispatched_qty_lbs",
    label: "Desp. Qty (LBS)",
    type: "number",
    quantity: true,
  },
  {
    key: "packed_qty_lbs",
    label: "Packed Qty (LBS)",
    type: "number",
    quantity: true,
  },
  {
    key: "wip_qty_lbs",
    label: "WIP (LBS)",
    type: "number",
    quantity: true,
  },
  {
    key: "rm_po_qty_lbs",
    label: "RM PO Qty (LBS)",
    type: "number",
    quantity: true,
  },
  {
    key: "current_status",
    label: "ETA",
    required: true,
  },
];

function today() {
  const value = new Date();

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatQuantity(value: number) {
  return value.toLocaleString("en-IN", {
    maximumFractionDigits: 3,
  });
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return String(value);
}

function formatDate(value: unknown) {
  if (typeof value !== "string" || !value) {
    return "—";
  }

  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function newItem(itemNumber: number): DraftItem {
  return {
    localId: crypto.randomUUID(),
    values: {
      so_item: String(itemNumber),
      order_qty_lbs: "",
      dispatched_qty_lbs: "0",
      packed_qty_lbs: "0",
      wip_qty_lbs: "0",
      rm_po_qty_lbs: "0",
      current_status: "Not provided",
      remark: "",
    },
  };
}

function getOrderTotals(order: SavedOrder) {
  const ordered = order.sales_order_items.reduce(
    (total, item) => total + Number(item.order_qty_lbs ?? 0),
    0
  );

  const dispatched = order.sales_order_items.reduce(
    (total, item) => total + Number(item.dispatched_qty_lbs ?? 0),
    0
  );

  return {
    ordered,
    dispatched,
    balance: ordered - dispatched,
    progress:
      ordered > 0
        ? Math.max(0, Math.min(100, (dispatched / ordered) * 100))
        : 0,
  };
}

function getOrderStatus(order: SavedOrder) {
  return String(order.order_status || "Pending");
}

function StatusBadge({ status }: { status: string }) {
  const className = status
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

  return (
    <span className={`badge ${className}`}>
      <i />
      {status}
    </span>
  );
}

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      "Content-Type": "application/json",
    },
  });

  const body = await response.json();

  if (!response.ok) {
    const detail = body.detail;

    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map(
                (entry: {
                  loc?: (string | number)[];
                  msg?: string;
                }) =>
                  `${entry.loc?.slice(1).join(".")}: ${entry.msg}`
              )
              .join("\n")
          : "The request failed. Please try again.";

    throw new Error(message);
  }

  return body;
}

function fieldInput(
  field: FieldDefinition,
  value: string,
  onChange: (value: string) => void
) {
  const positive =
    field.type === "number" &&
    (!field.quantity || field.key === "order_qty_lbs");

  return (
    <label key={field.key}>
      {field.label}
      {field.required ? " *" : ""}

      <input
        type={field.type ?? "text"}
        value={value}
        required={field.required}
        maxLength={
          field.type
            ? undefined
            : field.key === "so_item"
              ? 30
              : 100
        }
        min={
          field.type === "number"
            ? positive
              ? field.quantity
                ? "0.001"
                : "0.000001"
              : "0"
            : undefined
        }
        step={
          field.type === "number"
            ? field.quantity
              ? "0.001"
              : "0.000001"
            : undefined
        }
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export default function OrdersPage({
  initialOrder = null,
  view = "active",
}: {
  initialOrder?: SavedOrder | null;
  view?: "active" | "completed" | "archive";
}) {const [list, setList] = useState<OrderList>({
  items: [],
  total: 0,
});


  const [customers, setCustomers] = useState<Customer[]>([]);

  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);

  const [loading, setLoading] = useState(true);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [loadError, setLoadError] = useState("");
  const [customerError, setCustomerError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [message, setMessage] = useState("");

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<{
  id: string;
  version: number;
} | null>(null);
  const [selected, setSelected] = useState<SavedOrder | null>(initialOrder);

  const [minimized, setMinimized] = useState<SavedOrder[]>([]);

  const [previousView, setPreviousView] = useState(view);
  if (previousView !== view) { setPreviousView(view); setOffset(0); }

  const [header, setHeader] = useState<Record<string, string>>({});
  const [items, setItems] = useState<DraftItem[]>([]);

  // Load saved customers for the filter and create-order form.
  useEffect(() => {
    const controller = new AbortController();

    async function loadCustomers() {
      setCustomersLoading(true);
      setCustomerError("");

      try {
        const allCustomers: Customer[] = [];
        let nextOffset = 0;

        while (true) {
          const result: {
            items: Customer[];
            total: number;
          } = await request(
            `/customers?offset=${nextOffset}&limit=100`,
            { signal: controller.signal }
          );

          allCustomers.push(...result.items);
          nextOffset += result.items.length;

          if (
            nextOffset >= result.total ||
            result.items.length === 0
          ) {
            break;
          }
        }

        if (!controller.signal.aborted) {
          setCustomers(allCustomers);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setCustomerError(
            error instanceof Error
              ? error.message
              : "Unable to load customers."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setCustomersLoading(false);
        }
      }
    }

    void loadCustomers();

    return () => controller.abort();
  }, [refresh]);

  // Load one page of orders from the backend.
  useEffect(() => {
    const controller = new AbortController();

    async function loadOrders() {
      setLoading(true);
      setLoadError("");

      try {
        const params = new URLSearchParams({
          offset: String(offset),
          limit: String(PAGE_SIZE),
          q: search,
          view,
        });

        if (customerFilter) {
          params.set("customer_id", customerFilter);
        }

        const result: OrderList = await request(
          `/orders?${params.toString()}`,
          { signal: controller.signal }
        );

        if (!controller.signal.aborted) {
          setList(result);

        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load orders."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadOrders();

    return () => controller.abort();
  }, [offset, search, customerFilter, refresh, view]);

  function openCreate() {
    setHeader({
      customer_id: "",
      so_create_date: today(),
    });

    setItems([newItem(10)]);
    setSaveError("");
    setMessage("");
    setCreating(true);
    setEditing(null);
  }
    function openEdit(order: SavedOrder) {
    if (!Number.isInteger(order.edit_version)) {
      setMessage(
        "Refresh the orders list before editing this order."
      );
      return;
    }

    const nextHeader: Record<string, string> = {
      customer_id: String(
        order.customer_id ?? order.customers?.id ?? ""
      ),
    };

    for (const field of headerFields) {
      nextHeader[field.key] = String(order[field.key] ?? "");
    }

    const nextItems: DraftItem[] = order.sales_order_items.map(
      (item) => {
        const values: Record<string, string> = {};

        for (const field of itemFields) {
          values[field.key] = String(item[field.key] ?? "");
        }

        values.remark = String(item.remark ?? "");

        return {
          localId: item.id,
          savedId: item.id,
          values,
        };
      }
    );

    setHeader(nextHeader);
    setItems(nextItems);
    setEditing({
      id: order.id,
      version: order.edit_version,
    });

    setSaveError("");
    setMessage("");
    setSelected(null);
    setCreating(true);
  }

  function updateItem(
    localId: string,
    key: string,
    value: string
  ) {
    setItems((previous) =>
      previous.map((item) =>
        item.localId === localId
          ? {
              ...item,
              values: {
                ...item.values,
                [key]: value,
              },
            }
          : item
      )
    );
  }

  function addItem() {
    const highestNumber = Math.max(
      0,
      ...items.map((item) => {
        const value = Number(item.values.so_item);
        return Number.isFinite(value) ? value : 0;
      })
    );

    setItems((previous) => [
      ...previous,
      newItem(highestNumber + 10),
    ]);
  }

    async function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setSaveError("");
    setMessage("");

    try {
      const itemNumbers = items.map((item) =>
        (item.values.so_item ?? "").trim()
      );

      if (new Set(itemNumbers).size !== itemNumbers.length) {
        throw new Error(
          "Each SO item must have a different item number."
        );
      }

      const preparedItems = items.map((item) => {
        const values: Record<string, string | null> = {};

        for (const field of itemFields) {
          const raw = (item.values[field.key] ?? "").trim();

          values[field.key] =
            field.type === "number"
              ? raw || (field.quantity ? "0" : null)
              : raw;
        }

        values.remark = (item.values.remark ?? "").trim();

        const ordered = Number(values.order_qty_lbs);
        const dispatched = Number(values.dispatched_qty_lbs);

        if (!Number.isFinite(ordered) || ordered <= 0) {
          throw new Error(
            `SO item ${values.so_item}: order quantity must be greater than zero.`
          );
        }

        for (const field of itemFields.filter(
          (entry) => entry.quantity
        )) {
          const amount = Number(values[field.key]);

          if (!Number.isFinite(amount) || amount < 0) {
            throw new Error(
              `SO item ${values.so_item}: ${field.label} must be zero or greater.`
            );
          }
        }

        if (dispatched > ordered) {
          throw new Error(
            `SO item ${values.so_item}: dispatched quantity cannot exceed order quantity.`
          );
        }

        if (editing) {
          if (!item.savedId) {
            throw new Error(
              "This item has no saved ID. Close and reopen the order."
            );
          }

          values.id = item.savedId;
        }

        return values;
      });

      const payload: Record<string, unknown> = {
        customer_id: header.customer_id,
        items: preparedItems,
      };

      for (const field of headerFields) {
        const raw = (header[field.key] ?? "").trim();

        payload[field.key] =
          field.type === "date" ? raw || null : raw;
      }

      if (editing) {
        payload.expected_version = editing.version;
      }

      const wasEditing = editing !== null;

      const saved: {
        id: string;
        sales_order_no: string;
      } = await request(
        editing ? `/dev/orders/${editing.id}/edit` : "/orders",
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      setCreating(false);
      setEditing(null);
      setSelected(null);

      setMessage(
        `${saved.sales_order_no} ${
          wasEditing ? "updated" : "created"
        } successfully.`
      );

      setSearch("");
      setCustomerFilter("");
      setOffset(0);
      setRefresh((value) => value + 1);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Unable to save the order."
      );
    } finally {
      setSaving(false);
    }
  }

  // Compact main-page table: one row per sales order.
  function renderOrderSummary(orders: SavedOrder[]) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Sales order</th>
              <th>Customer</th>
              <th>Order quantity</th>
              <th>Dispatch progress</th>
              <th>Status</th>
              <th>ETA</th>
              <th>
                <span className="sr-only">View details</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {orders.map((order) => {
              const totals = getOrderTotals(order);
              const status = getOrderStatus(order);

              return (
                <tr key={order.id}>
                  <td>
                    <button
                      type="button"
                      className="order-link"
                      onClick={() => setSelected(order)}
                    >
                      {order.sales_order_no}
                    </button>

                    <small>
                      {order.sales_order_items.length} SO item
                      {order.sales_order_items.length === 1
                        ? ""
                        : "s"}
                      {" · "}
                      {formatDate(order.so_create_date)}
                    </small>
                  </td>

                  <td>
                    {order.customers?.name ?? "—"}
                    <small>{order.customers?.code}</small>
                  </td>

                  <td className="numeric">
                    {formatQuantity(totals.ordered)}{" "}
                    <small className="inline">LBS</small>
                  </td>

                  <td>
                    <div className="progress-label">
                      <span>
                        {formatQuantity(totals.dispatched)} LBS
                      </span>

                      <span>
                        {Math.round(totals.progress)}%
                      </span>
                    </div>

                    <div
                      className="progress"
                      role="progressbar"
                      aria-label={`Dispatch progress for ${order.sales_order_no}`}
                      aria-valuenow={Math.round(totals.progress)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <i
                        style={{
                          width: `${totals.progress}%`,
                        }}
                      />
                    </div>
                  </td>

                  <td>
                    <StatusBadge status={status} />
                  </td>
                  <td><OrderEta items={order.sales_order_items} /></td>

                  <td>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`View ${order.sales_order_no} details`}
                      onClick={() => setSelected(order)}
                    >
                      <Icon name="arrow" size={18} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Full details shown after clicking the arrow.
    // Full details shown after clicking the arrow.
  function renderOrderDetails(order: SavedOrder) {
    const totals = getOrderTotals(order);

    return (
      <div className="od-content">
        <div className="od-status-row">
          <StatusBadge status={getOrderStatus(order)} />
          <span>
            Created {formatDate(order.so_create_date)}
          </span>
        </div>

        <div className="od-summary">
          {[
            ["Ordered", totals.ordered],
            ["Dispatched", totals.dispatched],
            ["Remaining", totals.balance],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <span>{label}</span>
              <strong>{formatQuantity(Number(value))}</strong>
              <small>LBS</small>
            </div>
          ))}
        </div>

        <div className="od-progress">
          <div>
            <span>Dispatch progress</span>
            <strong>{Math.round(totals.progress)}%</strong>
          </div>
          <progress
            max={100}
            value={totals.progress}
            aria-label="Order dispatch progress"
          />
        </div>

        <section className="od-section">
          <h3>Order information</h3>

          <dl className="od-fields">
            <div>
              <dt>Customer</dt>
              <dd>{order.customers?.name ?? "—"}</dd>
            </div>
            <div>
              <dt>Customer code</dt>
              <dd>{order.customers?.code ?? "—"}</dd>
            </div>

            {headerFields.map((field) => (
              <div key={field.key}>
                <dt>{field.label}</dt>
                <dd>
                  {field.type === "date"
                    ? formatDate(order[field.key])
                    : displayValue(order[field.key])}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="od-section">
          <div className="od-section-heading">
            <h3>Product details</h3>
            <span>
              {order.sales_order_items.length} SO items
            </span>
          </div>

          <div className="od-items">
            {order.sales_order_items.map((item) => {
              const ordered = Number(item.order_qty_lbs ?? 0);
              const dispatched = Number(
                item.dispatched_qty_lbs ?? 0
              );

              return (
                <article className="od-item" key={item.id}>
                  <header className="od-item-header">
                    <div className="od-product-title">
                      <span className="od-product-icon">
                        <Icon name="box" size={20} />
                      </span>
                      <div>
                        <h4>
                          SO item {displayValue(item.so_item)}
                        </h4>
                        <p>
                          {displayValue(item.customer_grade)}
                          {" · "}
                          {displayValue(item.shape)}
                        </p>
                      </div>
                    </div>

                    <span className="order-eta">ETA: {String(item.current_status || "Not provided")}</span>
                  </header>

                  <dl className="od-fields od-specs">
                    {itemFields
                      .filter(
                        (field) =>
                          !field.quantity &&
                          ![
                            "so_item",
                            "current_status",
                            "remark",
                          ].includes(field.key)
                      )
                      .map((field) => (
                        <div key={field.key}>
                          <dt>{field.label}</dt>
                          <dd>
                            {displayValue(item[field.key])}
                          </dd>
                        </div>
                      ))}
                  </dl>

                  <div className="od-quantities">
                    {itemFields
                      .filter((field) => field.quantity)
                      .map((field) => (
                        <div key={field.key}>
                          <span>
                            {field.label.replace(" (LBS)", "")}
                          </span>
                          <strong>
                            {formatQuantity(
                              Number(item[field.key] ?? 0)
                            )}
                          </strong>
                          <small>LBS</small>
                        </div>
                      ))}

                    <div className="od-balance">
                      <span>Balance Qty</span>
                      <strong>
                        {formatQuantity(ordered - dispatched)}
                      </strong>
                      <small>LBS</small>
                    </div>
                  </div>

                  <div className="od-remark">
                    <span>Remark</span>
                    <p>{displayValue(item.remark)}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    );
  }
  return (
    <section className="live-orders">
      {/* Page toolbar */}
      <div className="customers-toolbar">
        <div>
          <h2>{view === "archive" ? "Archive" : view === "completed" ? "Completed orders" : "Active orders"}</h2>

          <p className="muted">
            Live database · Order summary · Quantities in LBS
          </p>
        </div>

        <div className="customer-actions">
          <button
            type="button"
            className="secondary"
            disabled={loading || customersLoading}
            onClick={() => setRefresh((value) => value + 1)}
          >
            Refresh
          </button>

          <button
            type="button"
            className="primary"
            disabled={
              customersLoading ||
              Boolean(customerError) ||
              customers.length === 0
            }
            hidden={view !== "active"}
            onClick={openCreate}
          >
            <Icon name="plus" size={18} />
            Create order
          </button>
        </div>
      </div>

      {/* Messages */}
      {customerError && (
        <p className="customer-error" role="alert">
          {customerError}
        </p>
      )}

      {!customersLoading &&
        !customerError &&
        customers.length === 0 && (
          <p className="notice">
            Add a customer in the Customers section before
            creating an order.
          </p>
        )}

      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}

      {/* Compact order list */}
      <section className="panel">
        <div className="filters">
          <label className="search">
            <Icon name="search" size={18} />

            <input
              aria-label="Search sales order number"
              placeholder="Search sales order number…"
              maxLength={100}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setOffset(0);
              }}
            />
          </label>

          <select
            aria-label="Filter orders by customer"
            value={customerFilter}
            disabled={customersLoading}
            onChange={(event) => {
              setCustomerFilter(event.target.value);
              setOffset(0);
            }}
          >
            <option value="">All customers</option>

            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.code} · {customer.name}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="empty" role="status">
            Loading orders…
          </div>
        ) : loadError ? (
          <p className="customer-error" role="alert">
            {loadError}
          </p>
        ) : list.items.length === 0 ? (
          <div className="empty">
            No matching orders found.
          </div>
        ) : (
          renderOrderSummary(list.items)
        )}

        <div className="table-footer">
          {loading
            ? "Loading…"
            : `${list.total} sales orders · Click the arrow to view complete details`}
        </div>
      </section>

      {/* Pagination */}
      <div className="customers-toolbar customer-pagination">
        <button
          type="button"
          className="secondary"
          disabled={loading || offset === 0}
          onClick={() =>
            setOffset(Math.max(0, offset - PAGE_SIZE))
          }
        >
          Previous
        </button>

        <span className="muted">
          Page {Math.floor(offset / PAGE_SIZE) + 1}
        </span>

        <button
          type="button"
          className="secondary"
          disabled={
            loading ||
            Boolean(loadError) ||
            offset + PAGE_SIZE >= list.total
          }
          onClick={() => setOffset(offset + PAGE_SIZE)}
        >
          Next
        </button>
      </div>

      {/* Create order modal */}
      {creating && (
        <Modal
          title="live-create-order-title"
          onClose={() => {
            if (!saving) {
              setCreating(false);
            }
          }}
        >
          <section className="detail-modal live-order-modal">
            <div className="panel-heading">
              <div>
                <h2 id="live-create-order-title">
                  {editing ? "Edit sales order" : "Create sales order"}
                </h2>

                <p>
                  Order details and all SO items are saved together.
                </p>
              </div>

              <button
                type="button"
                className="icon-button"
                disabled={saving}
                aria-label="Close order form"
                onClick={() => setCreating(false)}
              >
                <Icon name="close" />
              </button>
            </div>

            <form onSubmit={saveOrder}>
              <fieldset disabled={saving}>
                <h3>Customer and order details</h3>

                <div className="order-form-grid">
                  <label>
                    Customer *

                    <select
                      required
                      disabled={editing !== null}
                      value={header.customer_id ?? ""}
                      onChange={(event) => {
                        const customer = customers.find(
                          (entry) =>
                            entry.id === event.target.value
                        );

                        setHeader((previous) => ({
                          ...previous,
                          customer_id: event.target.value,
                          customer_sort_name:
                            customer?.name ?? "",
                        }));
                      }}
                    >
                      <option value="">
                        Select customer
                      </option>

                      {customers.map((customer) => (
                        <option
                          key={customer.id}
                          value={customer.id}
                        >
                          {customer.code} · {customer.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {headerFields.map((field) =>
                    fieldInput(
                      field,
                      header[field.key] ?? "",
                      (value) =>
                        setHeader((previous) => ({
                          ...previous,
                          [field.key]: value,
                        }))
                    )
                  )}
                </div>

                {/* SO items */}
                {items.map((item, index) => {
                  const balance =
                    Number(item.values.order_qty_lbs || 0) -
                    Number(item.values.dispatched_qty_lbs || 0);

                  return (
                    <section
                      className="order-item-form"
                      key={item.localId}
                    >
                      <div className="customers-toolbar">
                        <h3>SO item {index + 1}</h3>

                        <button
                          type="button"
                          className="secondary"
                          disabled={editing !== null || items.length === 1}
                          onClick={() =>
                            setItems((previous) =>
                              previous.filter(
                                (entry) =>
                                  entry.localId !== item.localId
                              )
                            )
                          }
                        >
                          Remove item
                        </button>
                      </div>

                      <div className="order-form-grid">
                        {itemFields.map((field) =>
                          editing && field.key === "so_item" ? (
                            <label key={field.key}>
                              {field.label}
                              <input
                                readOnly
                                value={item.values.so_item ?? ""}
                              />
                            </label>
                          ) : (
                            fieldInput(
                              field,
                              item.values[field.key] ?? "",
                              (value) =>
                                updateItem(item.localId, field.key, value)
                            )
                          )
                        )}

                        <label>
                          Balance Qty (LBS) · Calculated
                          <input
                            readOnly
                            value={
                              Number.isFinite(balance)
                                ? balance.toFixed(3)
                                : ""
                            }
                          />
                        </label>
                      </div>

                      <label>
                        Remark

                        <textarea
                          rows={3}
                          maxLength={2000}
                          value={item.values.remark ?? ""}
                          onChange={(event) =>
                            updateItem(
                              item.localId,
                              "remark",
                              event.target.value
                            )
                          }
                        />
                      </label>
                    </section>
                  );
                })}

                <button
                  type="button"
                  className="secondary"
                 disabled={editing !== null || items.length >= 100}
                  onClick={addItem}
                >
                  + Add SO item
                </button>

                {saveError && (
                  <p
                    className="customer-error order-save-error"
                    role="alert"
                  >
                    {saveError}
                  </p>
                )}

                <div className="form-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setCreating(false)}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="primary"
                  >
                    {saving
                      ? "Saving…"
                      : editing
                        ? "Save changes"
                        : "Create order"}
                  </button>
                </div>
              </fieldset>
            </form>
          </section>
        </Modal>
      )}

      {/* Full order details modal */}
      <OrderTray orders={minimized} onOpen={order => { if (selected) setMinimized(current => [...current.filter(entry => entry.id !== selected.id), selected]); setSelected(order); }} onClose={id => setMinimized(current => current.filter(order => order.id !== id))} />
      {selected && (
        <Modal
          title="saved-order-title"
          onClose={() => setSelected(null)}
        >
          <section className="detail-modal order-details-modern">
            <div className="panel-heading order-window-heading">
              <div>
                <p className="eyebrow">SALES ORDER</p>

                <h2 id="saved-order-title">
                  {selected.sales_order_no}
                </h2>

                <p>
                  {selected.customers?.name ?? "Customer"}
                  {" · "}
                  {selected.sales_order_items.length} SO items
                </p>
              </div>

              <div className="order-window-controls">
                <button type="button" className="icon-button" title="Minimize order" aria-label="Minimize order" onClick={() => { setMinimized(current => [...current.filter(order => order.id !== selected.id), selected]); setSelected(null); }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 17h14" /></svg></button>
              <button
                type="button"
                className="icon-button"
                aria-label="Close order details"
                onClick={() => { setMinimized(current => current.filter(order => order.id !== selected.id)); setSelected(null); }}
              >
                <Icon name="close" />
              </button>
              </div>
            </div>

            
            <OrderTray orders={minimized} onOpen={order => { if (selected) setMinimized(current => [...current.filter(entry => entry.id !== selected.id), selected]); setSelected(order); }} onClose={id => setMinimized(current => current.filter(order => order.id !== id))} />
            {renderOrderDetails(selected)}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
                marginBottom: 18,
              }}
            >
              <span className="muted">
                {selected.updated_at
                  ? `Last updated: ${new Date(
                    selected.updated_at
                  ).toLocaleString("en-GB")}`
                  : "No updates recorded yet"}
              </span>


            </div>
            <OrderActions onEdit={() => openEdit(selected)} editDisabled={customersLoading || Boolean(customerError)} key={`${selected.id}:${selected.edit_version}`} order={selected} onSaved={() => { setSelected(null); setMinimized([]); setRefresh(value => value + 1); }} />
            <OrderDocuments
              key={selected.id}
              readOnly={Boolean(selected.archived_at)}
              orderId={selected.id}
            />

            <button
              type="button"
              className="secondary"
              onClick={() => setSelected(null)}
            >
              Back to orders
            </button>
          </section>
        </Modal>
      )}
    </section>
  );
}