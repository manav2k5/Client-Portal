import Icon from "./Icon";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Modal from "./Modal";

type StockItem = {
  id: string;
  product: string;
  grade: string;
  size: string;
  location: string;
  quantity_kg: string | number;
  updated_at: string;
};

type Movement = {
  id: string;
  direction: "IN" | "OUT";
  entered_quantity: string | number;
  entered_unit: "KG" | "LBS";
  balance_after_kg: string | number;
  reason: string;
  created_at: string;
};

type List<T> = {
  items: T[];
  total: number;
};

const API =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8001";

const PAGE_SIZE = 20;
const KG_PER_LB = 0.45359237;

const products = [
  {
    group: "Stainless Steel Wires & Wire Rods",
    items: [
      "Coarse Wires",
      "Fine Wires",
      "Wire Rod",
      "Free Machining Wire",
      "Cold Heading Wire",
    ],
  },
  {
    group: "Stainless Steel Welding Wires",
    items: [
      "TIG Wires",
      "MIG Wires",
      "Core Wires",
      "Sub Arc Welding Wires",
    ],
  },
  {
    group: "Stainless Steel Bright Bars",
    items: [
      "Profiles",
      "Round Bars",
      "HEX and Square Bars",
      "VSQ Bars",
      "Fitmach Bars",
      "Tru-Tuf Bars",
      "Solo Bar",
    ],
  },
];

function number(value: string | number) {
  return Number(value).toLocaleString("en-IN", {
    maximumFractionDigits: 3,
  });
}

function Weight({ kg }: { kg: string | number }) {
  return (
    <>
      <strong>{number(kg)} KG</strong>
      <small>{number(Number(kg) / KG_PER_LB)} LBS</small>
    </>
  );
}

async function request(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);

  if (options.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
  });

  const body = await response.json();

  if (!response.ok) {
    const detail = body.detail;

    throw new Error(
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((entry: { msg: string }) => entry.msg).join("\n")
          : "Unable to complete the request."
    );
  }

  return body;
}

function History({ item }: { item: StockItem }) {
  const [list, setList] = useState<List<Movement>>({
    items: [],
    total: 0,
  });
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
    setLoading(true);
    setError("");

    await request(
      `/dev/inventory/${item.id}/movements?offset=${offset}&limit=${PAGE_SIZE}`,
      { signal: controller.signal }
    )
      .then((result: List<Movement>) => {
        if (!controller.signal.aborted) setList(result);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error ? err.message : "Unable to load history."
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    }
    void load();
    return () => controller.abort();
  }, [item.id, offset, refresh]);

  return (
    <>
      {loading ? (
        <p className="empty" role="status">Loading history…</p>
      ) : error ? (
        <div className="customer-error" role="alert">
          {error}
          <button
            className="secondary"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Movement</th>
                <th>Quantity entered</th>
                <th>Balance after</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((movement) => (
                <tr key={movement.id}>
                  <td>
                    {new Date(movement.created_at).toLocaleString("en-GB")}
                  </td>
                  <td>
                    {movement.direction === "IN" ? "Added" : "Removed"}
                  </td>
                  <td>
                    {number(movement.entered_quantity)}{" "}
                    {movement.entered_unit}
                  </td>
                  <td><Weight kg={movement.balance_after_kg} /></td>
                  <td className="inventory-wrap">{movement.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {!list.items.length && (
            <p className="empty">No stock movements yet.</p>
          )}
        </div>
      )}

      <div className="inventory-actions">
        <button
          className="secondary"
          disabled={loading || offset === 0}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
        >
          Previous
        </button>
        <span>Page {Math.floor(offset / PAGE_SIZE) + 1}</span>
        <button
          className="secondary"
          disabled={loading || Boolean(error) || offset + PAGE_SIZE >= list.total}
          onClick={() => setOffset(offset + PAGE_SIZE)}
        >
          Next
        </button>
      </div>
    </>
  );
}

export default function InventoryPage() {
  const [list, setList] = useState<List<StockItem>>({
    items: [],
    total: 0,
  });

  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState({ q: "", offset: 0 });
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const [movement, setMovement] = useState<{
    item: StockItem;
    direction: "IN" | "OUT";
    requestId: string;
  } | null>(null);

  const [historyItem, setHistoryItem] = useState<StockItem | null>(null);
  const [enteredQuantity, setEnteredQuantity] = useState("");
  const [unit, setUnit] = useState<"KG" | "LBS">("KG");

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
    setLoading(true);
    setLoadError("");

    const params = new URLSearchParams({
      q: filters.q,
      offset: String(filters.offset),
      limit: String(PAGE_SIZE),
    });

    await request(`/dev/inventory?${params}`, {
      signal: controller.signal,
    })
      .then((result: List<StockItem>) => {
        if (!controller.signal.aborted) setList(result);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(
            err instanceof Error ? err.message : "Unable to load inventory."
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    }
    void load();
    return () => controller.abort();
  }, [filters, refresh]);

  function openMovement(item: StockItem, direction: "IN" | "OUT") {
    setSaveError("");
    setEnteredQuantity("");
    setUnit("KG");
    setMovement({
      item,
      direction,
      requestId: crypto.randomUUID(),
    });
  }

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);

    setSaving(true);
    setSaveError("");

    try {
      const item: StockItem = await request("/dev/inventory", {
        method: "POST",
        body: JSON.stringify({
          product: String(fields.get("product") ?? ""),
          grade: String(fields.get("grade") ?? "").trim(),
          size: String(fields.get("size") ?? "").trim(),
          location: String(fields.get("location") ?? "").trim(),
        }),
      });

      setCreating(false);
      setSearchInput("");
      setFilters({ q: "", offset: 0 });
      setRefresh((value) => value + 1);
      setMessage("Stock entry created. Enter its opening quantity.");
      openMovement(item, "IN");
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Unable to create stock entry."
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!movement) return;

    const fields = new FormData(event.currentTarget);
    setSaving(true);
    setSaveError("");

    try {
      await request(`/dev/inventory/${movement.item.id}/movements`, {
        method: "POST",
        body: JSON.stringify({
          request_id: movement.requestId,
          direction: movement.direction,
          quantity: enteredQuantity,
          unit,
          reason: String(fields.get("reason") ?? "").trim(),
        }),
      });

      setMovement(null);
      setMessage("Stock movement saved successfully.");
      setRefresh((value) => value + 1);
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : "Unable to confirm the movement. Check History before retrying."
      );
    } finally {
      setSaving(false);
    }
  }

  const previewKG =
    Number(enteredQuantity) * (unit === "LBS" ? KG_PER_LB : 1);

  return (
    <section className="inventory-page">
      <div className="inventory-hero">
        <div>
          <span className="inventory-kicker">VENUS / MATERIALS</span><h2>Stockroom</h2>
          <p>Manage stock across products, grades and locations.</p>
        </div>

        <div className="customer-actions">
          <button
            className="secondary"
            disabled={loading || saving}
            onClick={() => setRefresh((value) => value + 1)}
          >
            Refresh
          </button>
          <button
            className="primary"
            onClick={() => {
              setSaveError("");
              setCreating(true);
            }}
          >
            + Add stock entry
          </button>
        </div>
      </div>

      <div className="inventory-overview"><div><span>Matching entries</span><strong>{loading || loadError ? "—" : list.total}</strong></div><div><span>Weight on this page</span><strong>{loading || loadError ? "—" : number(list.items.reduce((sum, item) => sum + Number(item.quantity_kg), 0))}<small> KG</small></strong></div><div><span>Product families</span><strong>03<small> Wires · Welding · Bars</small></strong></div></div>
      {message && <p className="notice" role="status">{message}</p>}

      <section className="inventory-catalog">
        <form
          className="filters"
          onSubmit={(event) => {
            event.preventDefault();
            setFilters({ q: searchInput.trim(), offset: 0 });
          }}
        >
          <label className="search">
            <input
              aria-label="Search inventory"
              placeholder="Search product, grade, size or location…"
              maxLength={150}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <button className="primary" disabled={loading}>Search</button>
          <select aria-label="Browse inventory product" value={products.some(group => group.items.includes(filters.q)) ? filters.q : ""} onChange={event => { setSearchInput(event.target.value); setFilters({q: event.target.value, offset: 0}); }}><option value="">All products</option>{products.map(group => <optgroup key={group.group} label={group.group}>{group.items.map(product => <option key={product}>{product}</option>)}</optgroup>)}</select>
          {filters.q && <button type="button" className="text-button" onClick={() => { setSearchInput(""); setFilters({q:"",offset:0}); }}>Clear filters</button>}
        </form>

        {loading ? (
          <p className="empty" role="status">Loading inventory…</p>
        ) : loadError ? (
          <p className="customer-error" role="alert">{loadError}</p>
        ) : (
          <div className="inventory-stock-grid">
            {list.items.map(item => <article className={`inventory-stock-card ${Number(item.quantity_kg) === 0 ? "is-empty" : ""}`} key={item.id}>
              <div className="inventory-card-top"><span className="inventory-material-mark" aria-hidden="true"><Icon name="box" size={22} /></span><span className="inventory-stock-state">{Number(item.quantity_kg) > 0 ? "In stock" : "No stock"}</span></div>
              <p className="inventory-family">{products.find(group => group.items.includes(item.product))?.group.replace("Stainless Steel ", "") || "Stainless steel"}</p>
              <h3>{item.product}</h3><div className="inventory-specs"><span>{item.grade}</span><span>{item.size}</span></div>
              <div className="inventory-card-weight"><Weight kg={item.quantity_kg} /></div>
              <div className="inventory-location"><span>LOCATION</span><strong>{item.location}</strong></div>
              <div className="inventory-card-actions"><button aria-label={`Receive ${item.product}, ${item.grade}`} onClick={() => openMovement(item,"IN")}>＋ Receive</button><button aria-label={`Issue ${item.product}, ${item.grade}`} disabled={Number(item.quantity_kg) <= 0} onClick={() => openMovement(item,"OUT")}>− Issue</button><button aria-label={`History for ${item.product}, ${item.grade}`} title="View movement history" onClick={() => setHistoryItem(item)}>History ↗</button></div>
            </article>)}
            {!list.items.length && <div className="inventory-empty"><h3>Your stockroom is clear.</h3><p>{filters.q ? "Try a different product or clear the filters." : "Add your first product, then record its opening stock."}</p></div>}
          </div>
        )}

        <div className="inventory-pagination">
          <button
            className="secondary"
            disabled={loading || filters.offset === 0}
            onClick={() =>
              setFilters((previous) => ({
                ...previous,
                offset: Math.max(0, previous.offset - PAGE_SIZE),
              }))
            }
          >
            Previous
          </button>
          <span>{loading ? "Loading…" : `${list.total} stock entries`}</span>
          <button
            className="secondary"
            disabled={
              loading ||
              Boolean(loadError) ||
              filters.offset + PAGE_SIZE >= list.total
            }
            onClick={() =>
              setFilters((previous) => ({
                ...previous,
                offset: previous.offset + PAGE_SIZE,
              }))
            }
          >
            Next
          </button>
        </div>
      </section>

      {creating && (
        <Modal
          title="inventory-create-title"
          onClose={() => {
            if (!saving) setCreating(false);
          }}
        >
          <section className="detail-modal inventory-modal inventory-styled-modal">
            <h2 id="inventory-create-title">Add stock entry</h2>
            <p className="muted">
              Create one entry for each product, grade, size and location.
            </p>

            <form onSubmit={createItem}>
              <fieldset disabled={saving}>
                <label>
                  Product
                  <select name="product" defaultValue="" required>
                    <option value="">Select product</option>
                    {products.map((group) => (
                      <optgroup key={group.group} label={group.group}>
                        {group.items.map((product) => (
                          <option key={product} value={product}>
                            {product}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>

                <label>
                  Grade
                  <input name="grade" placeholder="SS 304" maxLength={100} required />
                </label>

                <label>
                  Size / dimensions
                  <input name="size" placeholder="1.6 mm" maxLength={100} required />
                </label>

                <label>
                  Warehouse / location
                  <input
                    name="location"
                    placeholder="Main warehouse"
                    maxLength={150}
                    required
                  />
                </label>

                {saveError && (
                  <p className="customer-error" role="alert">{saveError}</p>
                )}

                <div className="form-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setCreating(false)}
                  >
                    Cancel
                  </button>
                  <button className="primary">
                    {saving ? "Saving…" : "Create entry"}
                  </button>
                </div>
              </fieldset>
            </form>
          </section>
        </Modal>
      )}

      {movement && (
        <Modal
          title="inventory-movement-title"
          onClose={() => {
            if (!saving) setMovement(null);
          }}
        >
          <section className="detail-modal inventory-modal inventory-styled-modal">
            <h2 id="inventory-movement-title">
              {movement.direction === "IN" ? "Add stock" : "Remove stock"}
            </h2>
            <p className="muted">
              {movement.item.product} · {movement.item.grade}
              {" · "}{movement.item.size}
              {" · "}{movement.item.location}
            </p>

            <form onSubmit={saveMovement}>
              <fieldset disabled={saving}>
                <label>
                  Quantity
                  <input
                    type="number"
                    min="0.001"
                    max="1000000000"
                    step="0.001"
                    value={enteredQuantity}
                    onChange={(event) => setEnteredQuantity(event.target.value)}
                    required
                  />
                </label>

                <label>
                  Unit
                  <select
                    value={unit}
                    onChange={(event) =>
                      setUnit(event.target.value as "KG" | "LBS")
                    }
                  >
                    <option value="KG">KG</option>
                    <option value="LBS">LBS</option>
                  </select>
                </label>

                {enteredQuantity && Number.isFinite(previewKG) && (
                  <p className="notice">
                    Equivalent: {number(previewKG)} KG /{" "}
                    {number(previewKG / KG_PER_LB)} LBS
                  </p>
                )}

                <label>
                  Reason
                  <textarea
                    name="reason"
                    placeholder="Opening stock, production received, correction…"
                    maxLength={500}
                    rows={3}
                    required
                  />
                </label>

                {saveError && (
                  <p className="customer-error" role="alert">{saveError}</p>
                )}

                <div className="form-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setMovement(null)}
                  >
                    Cancel
                  </button>
                  <button className="primary">
                    {saving ? "Saving…" : "Save movement"}
                  </button>
                </div>
              </fieldset>
            </form>
          </section>
        </Modal>
      )}

      {historyItem && (
        <Modal
          title="inventory-history-title"
          onClose={() => setHistoryItem(null)}
        >
          <section className="detail-modal inventory-history inventory-styled-modal">
            <div className="panel-heading">
              <div>
                <h2 id="inventory-history-title">Stock history</h2>
                <p>
                  {historyItem.product} · {historyItem.grade}
                  {" · "}{historyItem.size}
                </p>
              </div>
              <button
                className="secondary"
                onClick={() => setHistoryItem(null)}
              >
                Close
              </button>
            </div>
            <History key={historyItem.id} item={historyItem} />
          </section>
        </Modal>
      )}
    </section>
  );
}