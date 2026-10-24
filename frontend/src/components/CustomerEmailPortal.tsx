import { DashboardNav } from "./DashboardExtras";
import OrderEta from "./OrderEta";
import CustomerWorldMap from "./DestinationMap";
import ConnectivityMap from "./ConnectivityMap";
import OrderNavigation from "./OrderNavigation";
import OrderTray from "./OrderTray";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Modal from "./Modal";
import Icon from "./Icon";
import OrderDocuments from "./OrderDocuments";
import DocumentsPage from "./DocumentsPage";
type Item = {
  id: string;
  so_item: string;
  customer_grade: string | null;
  shape: string | null;
  current_status: string | null;
  order_qty_lbs: number | string;
  dispatched_qty_lbs: number | string;
  [key: string]: string | number | null;
};

type SalesOrder = {
  id: string;
  sales_order_no: string;
  order_status: string;
  so_create_date: string;
  country: string;
  customer_po_no: string | null;
  port_of_discharge?: string | null;
  customer_po_date?: string | null;
  customer_sort_name?: string | null;
  fortis_sales_order?: string | null;
  oc_date?: string | null;
  sales_order_items: Item[];
};

type Company = {
  id: string;
  code: string;
  name: string;
  email: string;
  city: string;
};

type Dashboard = {
  company: Company;
  orders: SalesOrder[];
  total: number;
};

type Page =
  | "Dashboard"
  | "Orders"
  | "Completed"
  | "Deliveries"
  | "Documents"
  | "Profile";

const API =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8001";

const PAGE_SIZE = 12;

const navigation: {
  page: Page;
  label: string;
  icon: string;
}[] = [
  { page: "Dashboard", label: "Dashboard", icon: "grid" },
  { page: "Completed", label: "Completed orders", icon: "box" },
  { page: "Orders", label: "My orders", icon: "box" },
  { page: "Deliveries", label: "Deliveries", icon: "truck" },
  { page: "Documents", label: "My documents", icon: "file" },
  { page: "Profile", label: "Company profile", icon: "users" },
];

const itemDetails = [
  ["finish_size_mm", "Finish size (mm)"],
  ["finish_size_inch", "Finish size (inch)"],
  ["shape", "Shape"],
  ["size_tolerance", "Size tolerance"],
  ["customer_grade", "Customer grade"],
  ["fg_length", "Finished length"],
  ["ht_condition", "Heat treatment"],
  ["order_qty_lbs", "Ordered (LBS)"],
  ["dispatched_qty_lbs", "Dispatched (LBS)"],
  ["packed_qty_lbs", "Packed (LBS)"],
  ["wip_qty_lbs", "Work in progress (LBS)"],
  ["rm_po_qty_lbs", "Raw material PO (LBS)"],
] as const;
const orderDetails = [
  ["country", "Destination"],
  ["port_of_discharge", "Port of Discharge"],
  ["customer_po_no", "Cust. PO No."],
  ["customer_po_date", "Cust. PO Date"],
  ["customer_sort_name", "Customer Sort Name"],
  ["sales_order_no", "Sales Order No."],
  ["fortis_sales_order", "Fortis Sales Order"],
  ["so_create_date", "SO Create Date"],
  ["oc_date", "OC Date"],
] as const;

function displayDetail(value: unknown) {
  return value === null || value === undefined || value === ""
    ? "—"
    : String(value);
}



function quantity(value: number) {
  return value.toLocaleString("en-IN", {
    maximumFractionDigits: 3,
  });
}

function dateLabel(value: string) {
  if (!value) return "—";

  const parsed = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00`
      : value
  );

  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function totals(order: SalesOrder) {
  const ordered = order.sales_order_items.reduce(
    (sum, item) => sum + Number(item.order_qty_lbs || 0),
    0
  );

  const dispatched = order.sales_order_items.reduce(
    (sum, item) => sum + Number(item.dispatched_qty_lbs || 0),
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

function orderStatus(order: SalesOrder) {
  return order.order_status || "Pending";
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

export default function CustomerEmailPortal({
  onBack,
}: {
  onBack: () => void;
}) {
  const [email, setEmail] = useState("");
  const [activeEmail, setActiveEmail] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [page, setPage] = useState<Page>("Dashboard");
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<SalesOrder | null>(null);

  const [minimized, setMinimized] = useState<SalesOrder[]>([]);

  const activeLoad = useRef<AbortController | null>(null);
  useEffect(() => () => activeLoad.current?.abort(), []);
  async function load(loginEmail: string) {
    activeLoad.current?.abort();
    const controller = new AbortController();
    activeLoad.current = controller;
    setBusy(true);
    setError("");

    try {
      const allOrders: SalesOrder[] = [];
      let company: Company | null = null;
      let fetchOffset = 0;

      // Fetch all pages so the dashboard totals cover all company orders.
      while (true) {
        const response = await fetch(`${API}/dev/customer-dashboard`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]),
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: loginEmail,
            offset: fetchOffset,
            limit: 100,
          }),
        });

        const body = await response.json();

        if (!response.ok) {
          throw new Error(
            typeof body.detail === "string"
              ? body.detail
              : "Unable to load your orders."
          );
        }

        if (controller.signal.aborted) return;
        if (!body?.company || !Array.isArray(body.orders) || !Number.isFinite(body.total)) {
          throw new Error("Customer dashboard returned incomplete data. Please refresh.");
        }
        const result = body as Dashboard;

        if (company && company.id !== result.company.id) {
          throw new Error(
            "Your company details changed. Please sign in again."
          );
        }

        company = result.company;
        allOrders.push(...result.orders);
        fetchOffset += result.orders.length;

        if (!result.orders.length || fetchOffset >= result.total) {
          break;
        }
      }

      if (!company) {
        throw new Error("Unable to load your company.");
      }

      const uniqueOrders = Array.from(
        new Map(allOrders.map((order) => [order.id, order])).values()
      );

      setDashboard({
        company,
        orders: uniqueOrders,
        total: uniqueOrders.length,
      });

      setActiveEmail(loginEmail);
      setOffset(0);
      setSelected(null);
    setMinimized([]);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(
        err instanceof Error ? err.message : "Unable to connect."
      );
      setDashboard(null);
      setSelected(null);
    setMinimized([]);
    } finally {
      if (activeLoad.current === controller) setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage("Dashboard");
    setSearch("");
    void load(email.trim().toLowerCase());
  }

  function navigate(next: Page) {
    setPage(next);
    setOffset(0);
    setSearch("");
    setSelected(null);

  }

  function exitWorkspace() {
    activeLoad.current?.abort();
    setBusy(false);
    setDashboard(null);
    setSelected(null);
    setMinimized([]);
    setActiveEmail("");
    setEmail("");
    setError("");
    setSearch("");
    setOffset(0);
    setPage("Dashboard");
  }

  function renderOrders(rows: SalesOrder[]) {
    return (
      <div className="table-wrap" aria-busy={busy}>
        <table>
          <thead>
            <tr>
              <th>Sales order</th>
              <th>Ordered</th>
              <th>Dispatch progress</th>
              <th>Status</th>
              <th>ETA</th>
              <th>
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((order) => {
              const summary = totals(order);

              return (
                <tr key={order.id}>
                  <td>
                    <button
                      className="order-link"
                      onClick={() => setSelected(order)}
                    >
                      {order.sales_order_no}
                    </button>
                    <small>
                      {dateLabel(order.so_create_date)}
                      {" · "}
                      {order.sales_order_items.length} SO items
                    </small>
                  </td>

                  <td className="numeric">
                    {quantity(summary.ordered)}{" "}
                    <small className="inline">LBS</small>
                  </td>

                  <td>
                    <div className="progress-label">
                      <span>
                        {quantity(summary.dispatched)} LBS
                      </span>
                      <span>{Math.round(summary.progress)}%</span>
                    </div>

                    <div
                      className="progress"
                      role="progressbar"
                      aria-label={`Dispatch progress for ${order.sales_order_no}`}
                      aria-valuenow={Math.round(summary.progress)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <i
                        style={{
                          width: `${summary.progress}%`,
                        }}
                      />
                    </div>
                  </td>

                  <td>
                    <StatusBadge status={orderStatus(order)} />
                  </td>
                  <td><OrderEta items={order.sales_order_items} /></td>

                  <td>
                    <button
                      className="icon-button"
                      aria-label={`View ${order.sales_order_no}`}
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

        {!rows.length && (
          <div className="empty">
            No orders found.
          </div>
        )}
      </div>
    );
  }

  if (!dashboard) {
    return (
      <main className="customer-test-login">
        <section className="customer-test-card">
          <p className="eyebrow">VENUS WIRES</p>
          <h1>Your customer workspace</h1>
          <p className="muted">
            Enter your registered company email to view your orders.
          </p>

          <form onSubmit={submit}>
            <label htmlFor="customer-login-email">
              Registered email
            </label>

            <input
              id="customer-login-email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={busy}
            />

            {error && (
              <p className="customer-error" role="alert">
                {error}
              </p>
            )}

            <button className="primary" disabled={busy}>
              {busy ? "Opening workspace…" : "Open my dashboard"}
            </button>
          </form>

          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={onBack}
          >
            Back to workspace selection
          </button>

          <small className="customer-test-note">
            Local testing preview · Email ownership is not verified
          </small>
        </section>
      </main>
    );
  }

  const { company, orders } = dashboard;

  const initials =
    company.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "CW";

  const summaries = orders.map(totals);

  const ordered = summaries.reduce(
    (sum, order) => sum + order.ordered,
    0
  );

  const dispatched = summaries.reduce(
    (sum, order) => sum + order.dispatched,
    0
  );

  const balance = ordered - dispatched;

  const openOrders = orders.filter(order => order.order_status !== "Completed").length;

  const pipeline = [
    {
      label: "Awaiting dispatch",
      count: summaries.filter(
        (order) => order.ordered > 0 && order.dispatched === 0
      ).length,
    },
    {
      label: "Partially dispatched",
      count: summaries.filter(
        (order) =>
          order.dispatched > 0 &&
          order.dispatched < order.ordered
      ).length,
    },
    {
      label: "Fully dispatched",
      count: summaries.filter(
        (order) =>
          order.ordered > 0 &&
          order.dispatched >= order.ordered
      ).length,
    },
  ];

  const stats = [
    {
      label: "Total orders",
      value: quantity(orders.length),
      icon: "box",
      note: "Across your company",
    },
    {
      label: "Open orders",
      value: quantity(openOrders),
      icon: "clock",
      note: "Not yet marked completed",
    },
    {
      label: "Dispatched quantity",
      value: quantity(dispatched),
      icon: "truck",
      note: "LBS across all orders",
    },
    {
      label: "Completed orders",
      value: quantity(orders.filter(order => order.order_status === "Completed").length),
      icon: "box",
      note: "Marked completed by the administrator",
    },
  ];

  const query = search.trim().toLowerCase();

  const filteredOrders = orders.filter(order => page === "Completed" ? order.order_status === "Completed" : order.order_status !== "Completed").filter((order) =>
    [
      order.sales_order_no,
      order.customer_po_no || "",
      ...order.sales_order_items.map(
        (item) => item.customer_grade || ""
      ),
    ]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );

  const visibleOrders = filteredOrders.slice(
    offset,
    offset + PAGE_SIZE
  );

  return (
    <div className={`app-shell customer-original-layout customer-floating-workspace ${page === "Dashboard" ? "dashboard-fit-view" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">V</span>

          <div>
            VENUS <span>WIRES</span>
            <small>CLIENT PORTAL</small>
          </div>
        </div>

        <div className="workspace-label">
          CUSTOMER WORKSPACE
        </div>

        <nav aria-label="Customer navigation">
          {navigation.filter(item => item.page !== "Completed").map((item) => item.page === "Orders" ? <OrderNavigation key="orders-group" page={page} onNavigate={next => { if (next !== "Archive") navigate(next); }} /> : (
            <button
              key={item.page}
              className={page === item.page ? "active" : ""}
              aria-current={page === item.page ? "page" : undefined}
              onClick={() => navigate(item.page)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="preview-card">
            <span className="live-dot" />
            Company workspace
            <p>
              Your orders and dispatch progress,
              <br />
              together in one place.
            </p>
          </div>

          <div className="user">
            <span className="avatar">{initials}</span>
            <div>
              <strong>{company.name}</strong>
              <small>{company.code}</small>
            </div>
          </div>

          <button
            className="switch"
            disabled={busy}
            onClick={exitWorkspace}
          >
            <Icon name="exit" size={17} />
            Exit workspace
          </button>
        </div>
      </aside>

      <div className="main-shell">
        <DashboardNav orders={orders.slice(0,5)} documents={[]} onOpen={setSelected} onNavigate={next=>navigate(next === "Customers" ? "Profile" : next)} customer={{name:company.name,email:company.email,initials}} />

        <main className="content">
          <div className="page-title">
            <div>
              <p className="eyebrow">YOUR BUSINESS, CONNECTED</p>

              <h1>
                {page === "Dashboard"
                  ? `Welcome, ${company.name}`
                  : page === "Orders"
                    ? "My orders"
                    : page === "Profile"
                      ? "Company profile"
                      : page}
              </h1>

              <p>
                {page === "Dashboard"
                  ? "Your orders and dispatch progress. All in one place."
                  : `Information for ${company.name}.`}
              </p>
            </div>

            <button
              className="secondary"
              disabled={busy}
              onClick={() => void load(activeEmail)}
            >
              {busy ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {page === "Dashboard" && (
            <div className="customer-command-dashboard">
              <div className="stats">
                {stats.map((stat) => (
                  <article className="stat" key={stat.label}>
                    <div>
                      <span>{stat.label}</span>
                      <span className="soft-icon">
                        <Icon name={stat.icon} />
                      </span>
                    </div>
                    <strong>{stat.value}</strong>
                    <small>{stat.note}</small>
                  </article>
                ))}
              </div>

              <div className="overview-grid">
                <section className="panel recent-orders">
                  <div className="panel-heading">
                    <div>
                      <h2>Recent orders</h2>
                      <p>Your latest sales orders at a glance</p>
                    </div>

                    <button
                      className="text-button"
                      onClick={() => navigate("Orders")}
                    >
                      View all <Icon name="arrow" size={16} />
                    </button>
                  </div>

                  {renderOrders(orders.slice(0, 5))}
                </section>

                <section className="panel customer-dispatch-map">
                  <div className="panel-heading"><div><p className="map-eyebrow">CONNECTED LOCATIONS</p><h2>Dispatch overview</h2></div><Icon name="truck" /></div>
                  <CustomerWorldMap orders={orders} company={company.name} compact />
                  <div className="map-dispatch-total"><span>Awaiting dispatch</span><strong>{quantity(Math.max(0,balance))} <small>LBS</small></strong><p>Across your company's orders</p></div>
                  <button className="map-action" onClick={() => navigate("Orders")}>View my orders <Icon name="arrow" size={16}/></button>
                </section>

                <section className="panel company-map-panel">
                  <div className="panel-heading"><div><p className="map-eyebrow">YOUR COMPANY · CONNECTED</p><h2>Company & global connection</h2></div><button className="map-action" onClick={() => navigate("Profile")}>View profile ↗</button></div>
                  <div className="company-map-layout"><div className="company-map-identity"><span className="map-avatar">{initials}</span><h3>{company.name}</h3><dl><dt>Company code</dt><dd>{company.code}</dd><dt>Email</dt><dd>{company.email}</dd><dt>Registered location</dt><dd>{company.city || "Not provided"}</dd></dl><div className="map-identity-footer"><i/> Connected to Venus Wires</div></div><div className="company-connectivity-art" aria-hidden="true"><svg viewBox="0 0 220 160"><defs><radialGradient id="connectivity-halo"><stop stopColor="#54efff" stopOpacity=".3"/><stop offset="1" stopColor="#071121" stopOpacity="0"/></radialGradient></defs><ellipse cx="110" cy="80" rx="100" ry="78" fill="url(#connectivity-halo)"/><g fill="none" stroke="#49ddeb" strokeWidth=".65" opacity=".6">{[[110,12],[56,34],[163,30],[25,78],[191,78],[58,126],[162,131],[110,151],[110,55],[82,94],[144,96]].flatMap((point,i,points) => points.slice(i+1).filter((_,j) => (i+j)%3 !== 0).map((end,j) => <path key={`${i}-${j}`} d={`M${point[0]} ${point[1]}L${end[0]} ${end[1]}`}/>))}</g><g className="connectivity-nodes">{[[110,12],[56,34],[163,30],[25,78],[191,78],[58,126],[162,131],[110,151],[110,55],[82,94],[144,96]].map(([x,y],i) => <g key={i}><circle cx={x} cy={y} r="7" fill={i%3 ? "#53edff" : "#bd80ff"} opacity=".15"/><circle cx={x} cy={y} r="3" fill={i%3 ? "#8cf7ff" : "#d8b1ff"}/></g>)}</g></svg></div><ConnectivityMap/></div>
                </section>
                <section className="panel flow-panel">
                  <div className="panel-heading">
                    <h2>Dispatch pipeline</h2>
                    <Icon name="box" />
                  </div>

                  {pipeline.map((stage) => (
                    <div className="pipeline-row" key={stage.label}>
                      <div>
                        <span>{stage.label}</span>
                        <strong>{stage.count}</strong>
                      </div>

                      <div className="progress">
                        <i
                          style={{
                            width: `${
                              orders.length
                                ? (stage.count / orders.length) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </section>
              </div>
            </div>
          )}

          {(page === "Orders" || page === "Completed") && (
            <section className="panel">
              <div className="filters">
                <label className="search">
                  <Icon name="search" size={18} />

                  <input
                    aria-label="Search your orders"
                    placeholder="Search order, PO number or grade…"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setOffset(0);
                    }}
                  />
                </label>
              </div>

              {renderOrders(visibleOrders)}

              <div className="customer-test-pagination">
                <button
                  className="secondary"
                  disabled={busy || offset === 0}
                  onClick={() =>
                    setOffset(Math.max(0, offset - PAGE_SIZE))
                  }
                >
                  Previous
                </button>

                <span>
                  {filteredOrders.length} orders · Page{" "}
                  {Math.floor(offset / PAGE_SIZE) + 1}
                </span>

                <button
                  className="secondary"
                  disabled={
                    busy ||
                    offset + PAGE_SIZE >= filteredOrders.length
                  }
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next
                </button>
              </div>
            </section>
          )}

          {page === "Profile" && (
            <section className="panel profile">
              <span className="company-avatar">{initials}</span>
              <h2>{company.name}</h2>
              <p className="muted">Customer account</p>

              <dl>
                {[
                  ["Company code", company.code],
                  ["Email", company.email],
                  ["Location", company.city],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {page === "Documents" && (
            <DocumentsPage
              key={activeEmail}
              customerEmail={activeEmail}
            />
          )}

          {page === "Deliveries" && (
            <section className="panel">
              <div className="empty">
                <Icon name="truck" size={30} />
                <h3>Delivery tracking is not available yet</h3>
                <p>
                  You can view dispatched quantities in My orders.
                </p>
              </div>
            </section>
          )}

          <footer className="page-footer">
            <span>VENUS WIRES / Client portal</span>
            <span>{company.name}</span>
          </footer>
        </main>
      </div>

            <OrderTray orders={minimized} onOpen={order => { if (selected) setMinimized(current => [...current.filter(entry => entry.id !== selected.id), selected]); setSelected(order); }} onClose={id => setMinimized(current => current.filter(order => order.id !== id))} />
            {selected && (
        <Modal
          title="customer-order-title"
          onClose={() => setSelected(null)}
        >
          <section className="detail-modal order-details-modern">
            <div className="panel-heading order-window-heading">
              <div>
                <p className="eyebrow">SALES ORDER</p>

                <h2 id="customer-order-title">
                  {selected.sales_order_no}
                </h2>

                <p>
                  {company.name}
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
            <div className="od-content">
              <div className="od-status-row">
                <StatusBadge status={orderStatus(selected)} />
                <span>
                  Created {dateLabel(selected.so_create_date)}
                </span>
              </div>

              <div className="od-summary">
                {[
                  ["Ordered", totals(selected).ordered],
                  ["Dispatched", totals(selected).dispatched],
                  ["Remaining", totals(selected).balance],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <span>{label}</span>
                    <strong>{quantity(Number(value))}</strong>
                    <small>LBS</small>
                  </div>
                ))}
              </div>

              <div className="od-progress">
                <div>
                  <span>Dispatch progress</span>
                  <strong>
                    {Math.round(totals(selected).progress)}%
                  </strong>
                </div>

                <progress
                  max={100}
                  value={totals(selected).progress}
                  aria-label="Order dispatch progress"
                />
              </div>

              <section className="od-section">
                <h3>Order information</h3>

                <dl className="od-fields">
                  <div>
                    <dt>Customer</dt>
                    <dd>{company.name}</dd>
                  </div>

                  <div>
                    <dt>Customer code</dt>
                    <dd>{company.code}</dd>
                  </div>

                  {orderDetails.map(([key, label]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>
                        {key.endsWith("_date")
                          ? dateLabel(String(selected[key] ?? ""))
                          : displayDetail(selected[key])}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="od-section">
                <div className="od-section-heading">
                  <h3>Product details</h3>
                  <span>
                    {selected.sales_order_items.length} SO items
                  </span>
                </div>

                <div className="od-items">
                  {selected.sales_order_items.map((item) => {
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
                                SO item {displayDetail(item.so_item)}
                              </h4>

                              <p>
                                {displayDetail(item.customer_grade)}
                                {" · "}
                                {displayDetail(item.shape)}
                              </p>
                            </div>
                          </div>

                          <span className="order-eta">ETA: {item.current_status || "Not provided"}</span>
                        </header>

                        <dl className="od-fields od-specs">
                          {itemDetails
                            .filter(([key]) => !key.endsWith("_lbs"))
                            .map(([key, label]) => (
                              <div key={key}>
                                <dt>{label}</dt>
                                <dd>{displayDetail(item[key])}</dd>
                              </div>
                            ))}
                        </dl>

                        <div className="od-quantities">
                          {itemDetails
                            .filter(([key]) => key.endsWith("_lbs"))
                            .map(([key, label]) => (
                              <div key={key}>
                                <span>
                                  {label.replace(" (LBS)", "")}
                                </span>
                                <strong>
                                  {quantity(Number(item[key] ?? 0))}
                                </strong>
                                <small>LBS</small>
                              </div>
                            ))}

                          <div className="od-balance">
                            <span>Balance Qty</span>
                            <strong>
                              {quantity(ordered - dispatched)}
                            </strong>
                            <small>LBS</small>
                          </div>
                        </div>

                        <div className="od-remark">
                          <span>Remark</span>
                          <p>{displayDetail(item.remark)}</p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>

            <OrderDocuments
              key={`${selected.id}:${activeEmail}`}
              orderId={selected.id}
              customerEmail={activeEmail}
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
    </div>
  );
}