import { useEffect, useState } from "react";
import type { FormEvent } from "react";

type Customer = {
  id: string;
  code: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  city: string;
  address: string;
};

type CustomerList = {
  items: Customer[];
  total: number;
};

const API = "http://127.0.0.1:8001";
const PAGE_SIZE = 12;

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
    },
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : "Check the form fields and try again."
    );
  }

  return body;
}

export default function CustomersPage() {
  const [list, setList] = useState<CustomerList>({
    items: [],
    total: 0,
  });
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");

      try {
        const data: CustomerList = await request(
          `/customers?offset=${offset}&limit=${PAGE_SIZE}`,
          { signal: controller.signal }
        );

        if (!controller.signal.aborted) {
          setList(data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load customers."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [offset, refresh]);

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const fields = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    setMessage("");

    const payload = {
      code: String(fields.get("code")).trim().toUpperCase(),
      name: String(fields.get("name")).trim(),
      contact: String(fields.get("contact")).trim(),
      email: String(fields.get("email")).trim(),
      phone: String(fields.get("phone")).trim(),
      city: String(fields.get("city")).trim(),
      address: String(fields.get("address")).trim(),
    };

    try {
      const saved: Customer = await request("/customers", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setShowForm(false);
      setMessage(`${saved.name} saved successfully.`);
      setOffset(0);
      setRefresh((value) => value + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save customer."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="live-customers">
      <div className="customers-toolbar">
        <div>
          <h2>Customer directory</h2>
          <p className="muted">
            Saved in your database · Local development
          </p>
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
            disabled={saving}
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "Close form" : "+ Add customer"}
          </button>
        </div>
      </div>

      {error && (
        <p className="customer-error" role="alert">{error}</p>
      )}

      {message && (
        <p className="notice" role="status">{message}</p>
      )}

      {showForm && (
        <form className="panel customer-form" onSubmit={saveCustomer}>
          <h3>New customer</h3>

          <div className="customer-form-grid">
            <label>
              Customer code
              <input
                name="code"
                placeholder="ABC-001"
                pattern="[A-Za-z0-9-]{2,30}"
                title="2–30 letters, numbers or hyphens"
                maxLength={30}
                required
              />
            </label>

            <label>
              Company name
              <input name="name" maxLength={150} required />
            </label>

            <label>
              Contact person
              <input name="contact" maxLength={100} required />
            </label>

            <label>
              Email
              <input
                name="email"
                type="email"
                maxLength={254}
                required
              />
            </label>

            <label>
              Phone
              <input name="phone" type="tel" maxLength={30} />
            </label>

            <label>
              City
              <input name="city" maxLength={100} required />
            </label>
          </div>

          <label>
            Address
            <textarea name="address" rows={3} maxLength={500} />
          </label>

          <button className="primary" disabled={saving}>
            {saving ? "Saving…" : "Save customer"}
          </button>
        </form>
      )}

      {loading ? (
        <div className="panel empty" role="status">
          Loading customers…
        </div>
      ) : error ? (
        <div className="panel empty">
          Resolve the error above, then click Refresh.
        </div>
      ) : list.items.length === 0 ? (
        <div className="panel empty">
          No customers yet. Click “Add customer” to get started.
        </div>
      ) : (
        <div className="customer-grid">
          {list.items.map((customer) => (
            <article className="panel customer-card" key={customer.id}>
              <span className="company-avatar">
                {customer.name.slice(0, 2).toUpperCase()}
              </span>

              <h2>{customer.name}</h2>
              <p>{customer.code} · {customer.city}</p>

              <dl>
                <div>
                  <dt>Contact</dt>
                  <dd>{customer.contact}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{customer.email}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{customer.phone || "—"}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>{customer.address || "—"}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}

      <div className="customers-toolbar customer-pagination">
        <button
          className="secondary"
          disabled={loading || saving || offset === 0}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
        >
          Previous
        </button>

        <span className="muted">
          {loading ? "Loading…" : `${list.total} customers`}
        </span>

        <button
          className="secondary"
          disabled={
            loading || saving || offset + PAGE_SIZE >= list.total
          }
          onClick={() => setOffset(offset + PAGE_SIZE)}
        >
          Next
        </button>
      </div>
    </section>
  );
}