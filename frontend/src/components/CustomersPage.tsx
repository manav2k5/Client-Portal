import PhoneField from "./PhoneField";
import Icon from "./Icon";
import RecordActions from "./RecordActions";
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
  edit_version: number;
  updated_at: string | null;
};

type CustomerList = {
  items: Customer[];
  total: number;
};

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8001";
const PAGE_SIZE = 5;

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
  const [editing, setEditing] = useState<Customer | null>(null);
  const [formError, setFormError] = useState("");
  useEffect(() => { if (!message) return; const timer=window.setTimeout(()=>setMessage(""),6000); return ()=>window.clearTimeout(timer); }, [message]);
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

  function openEdit(customer: Customer) {
  if (!Number.isInteger(customer.edit_version)) {
    setFormError("Refresh the customer list before editing.");
    return;
  }

  setEditing(customer);
  setFormError("");
  setMessage("");
  setShowForm(true);
}

function closeForm() {
  setShowForm(false);
  setEditing(null);
  setFormError("");
}

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();

  const fields = new FormData(event.currentTarget);

  setSaving(true);
  setFormError("");
  setMessage("");

  const payload = {
    code: String(fields.get("code") ?? "").trim().toUpperCase(),
    name: String(fields.get("name") ?? "").trim(),
    contact: String(fields.get("contact") ?? "").trim(),
    email: String(fields.get("email") ?? "").trim().toLowerCase(),
    phone: String(fields.get("phone") ?? "").trim(),
    city: String(fields.get("city") ?? "").trim(),
    address: String(fields.get("address") ?? "").trim(),
    ...(editing
      ? { expected_version: editing.edit_version }
      : {}),
  };

  const dialCode = String(fields.get("dial_code") || "");
  if (payload.phone && !(editing && payload.phone === editing.phone && !dialCode)) {
    if (!/^[+0-9\s().-]+$/.test(payload.phone)) { setFormError("Phone number may only contain digits, spaces, +, brackets or hyphens."); setSaving(false); return; }
    const digits=payload.phone.replace(/[\s().-]/g, "");
    const full=digits.startsWith("+") ? digits : dialCode ? `+${dialCode}${digits}` : digits;
    if (!/^\+[1-9]\d{6,14}$/.test(full)) { setFormError("Enter an international phone number with a dial code and 7–15 digits in total."); setSaving(false); return; }
    payload.phone=full;
  }

  const emailChanged =
    editing !== null &&
    payload.email !== editing.email.trim().toLowerCase();

  try {
    const saved: Customer = await request(
      editing ? `/dev/customers/${editing.id}/edit` : "/customers",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );

    setMessage(
      `${saved.name} ${editing ? "updated" : "created"} successfully.${
        emailChanged
          ? " Use the new email to open this company’s customer workspace."
          : ""
      }`
    );

    if (!editing) setOffset(0);

    setShowForm(false);
    setEditing(null);
    setRefresh((value) => value + 1);
  } catch (err) {
    setFormError(
      err instanceof Error ? err.message : "Unable to save customer."
    );
  } finally {
    setSaving(false);
  }
}

  return (
    <section className="live-customers">
      <div className="customers-toolbar">
        <div className="customer-actions">
          <button
            className="secondary"
            disabled={loading || saving}
            onClick={() => setRefresh((value) => value + 1)}
          >
            Refresh
          </button>

          <button
            type="button"
            className="primary"
            disabled={saving}
            onClick={() => {
              if (showForm) {
                closeForm();
              } else {
                setEditing(null);
                setFormError("");
                setMessage("");
                setShowForm(true);
              }
            }}
          >
            {showForm ? "Close form" : "+ Add customer"}
          </button>
        </div>
      </div>

      {error && (
        <p className="customer-error" role="alert">{error}</p>
      )}

      {formError && (
        <p className="customer-error" role="alert">
          {formError}
        </p>
      )}

      {message && (
        <div className="customer-success-toast" role="status"><Icon name="check" size={18}/><span>{message}</span><button type="button" aria-label="Dismiss notification" onClick={()=>setMessage("")}>×</button></div>
      )}

      {showForm && (
        <form 
          key={editing?.id ?? "new-customer"}
          className="panel customer-form"
          onSubmit={saveCustomer}
        >
          <h3>{editing ? "Edit customer" : "New customer"}</h3>

          {editing && (
            <p className="notice">
              Changing the email changes which email opens this company’s
              customer workspace. Existing orders and documents stay linked.
            </p>
          )}

          <div className="customer-form-grid">
            <label>
              Customer code
              <input
                name="code"
                defaultValue={editing?.code ?? ""}
                placeholder="ABC-001"
                pattern="[A-Za-z0-9-]{2,30}"
                title="2–30 letters, numbers or hyphens"
                maxLength={30}
                required
                disabled={saving}
              />
            </label>

            <label>
              Company name
              <input
                name="name"
                defaultValue={editing?.name ?? ""}
                maxLength={150}
                required
                disabled={saving}
              />
            </label>

            <label>
              Contact person
              <input
                name="contact"
                defaultValue={editing?.contact ?? ""}
                maxLength={100}
                required
                disabled={saving}
              />
            </label>

            <label>
              Email
              <input
                name="email"
                type="email"
                defaultValue={editing?.email ?? ""}
                maxLength={254}
                required
                disabled={saving}
              />
            </label>

            <PhoneField value={editing?.phone || ""} disabled={saving}/>

            <label>
              City
              <input
                name="city"
                defaultValue={editing?.city ?? ""}
                maxLength={100}
                required
                disabled={saving}
              />
            </label>
          </div>

          <label>
            Address
            <textarea
              name="address"
              defaultValue={editing?.address ?? ""}
              rows={3}
              maxLength={500}
              disabled={saving}
            />
          </label>

          <div className="form-actions">
            <button
              type="button"
              className="secondary"
              disabled={saving}
              onClick={closeForm}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="primary"
              disabled={saving}
            >
              {saving
                ? "Saving…"
                : editing
                  ? "Save changes"
                  : "Create customer"}
            </button>
          </div>
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
              <button
                type="button"
                className="icon-button document-action-icon"
                title="Edit customer"
                aria-label={`Edit ${customer.name}`}
                disabled={saving || showForm}
                onClick={() => openEdit(customer)}
              >
                <Icon name="edit" size={18}/>
              </button>
              <RecordActions iconOnly id={customer.id} name={customer.name} kind="customer" onChanged={text => { setMessage(text); setEditing(null); setShowForm(false); setOffset(0); setRefresh(value => value + 1); }} />
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