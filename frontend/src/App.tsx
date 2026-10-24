import OrderNavigation from "./components/OrderNavigation";
import { useState } from "react";
import type { FormEvent } from "react";
import DocumentsPage from "./components/DocumentsPage";
import Icon from "./components/Icon";
import Modal from "./components/Modal";
import CustomersPage from "./components/CustomersPage";
import OrdersPage from "./components/OrdersPage";
import AdminDashboard from "./components/AdminDashboard";
import type { SavedOrder } from "./components/OrdersPage";
import InventoryPage from "./components/InventoryPage";
import {
  customers as sampleCustomers,
  initialOrders,
  shipments,
  documents,
  date,
  number,
} from "./data";

import type { Order } from "./data";
import "./App.css";
import "./components/InventoryPage.css";
import "./components/dashboard-theme.css";
import CustomerEmailPortal from "./components/CustomerEmailPortal";

type Role = "admin" | "customer";

type Page =
  | "Dashboard"
  | "Customers"
  | "Orders"
  | "Completed"
  | "Archive"
  | "Inventory"
  | "Deliveries"
  | "Documents"
  | "Profile";

const icons: Record<Page, string> = {
  Dashboard: "grid",
  Customers: "users",
  Orders: "box",
  Completed: "box",
  Archive: "box",
  Inventory: "box",
  Deliveries: "truck",
  Documents: "file",
  Profile: "users",
};

const orderStatuses = [
  "Processing",
  "Ready to dispatch",
  "Partially dispatched",
  "Delivered",
] as const;

function Badge({ status }: { status: string }) {
  const className = status.toLowerCase().replaceAll(" ", "-");

  return (
    <span className={`badge ${className}`}>
      <i />
      {status}
    </span>
  );
}

function downloadDocument(doc: (typeof documents)[number]) {
  const content = [
    "VENUS WIRES — DEMONSTRATION DOCUMENT",
    "",
    doc.name,
    `Order: ${doc.order}`,
    `Category: ${doc.type}`,
    "",
    "Sample content only.",
    "This is not a commercial or quality document.",
  ].join("\n");

  const blob = new Blob([content], {
    type: "text/plain",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${doc.id}-sample.txt`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [dashboardRefresh, setDashboardRefresh] = useState(0);
  const [dashboardOrder, setDashboardOrder] = useState<SavedOrder | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [page, setPage] = useState<Page>("Dashboard");

  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [company, setCompany] = useState("All customers");

  const [selected, setSelected] = useState<Order | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");

  const admin = role === "admin";

  // Orders, shipments and documents still use sample data.
  // The Customers page loads real records from FastAPI.
  const visibleOrders = orders.filter(
    (order) => admin || order.customer === "ABC Industries"
  );

  const visibleDocs = documents.filter((document) =>
    visibleOrders.some((order) => order.id === document.order)
  );

  const visibleShipments = shipments.filter((shipment) =>
    visibleOrders.some((order) => order.id === shipment.order)
  );

  const filteredOrders = visibleOrders.filter((order) => {
    const searchableText =
      `${order.id} ${order.customer} ${order.material}`.toLowerCase();

    const matchesSearch = searchableText.includes(search.toLowerCase());

    const matchesStatus =
      status === "All statuses" || order.status === status;

    const matchesCompany =
      company === "All customers" || order.customer === company;

    return matchesSearch && matchesStatus && matchesCompany;
  });

  const navigation: Page[] = admin
    ? ["Dashboard", "Customers", "Orders", "Completed", "Archive", "Inventory", "Deliveries", "Documents"]
    : ["Dashboard", "Orders", "Deliveries", "Documents", "Profile"];



  function navigate(nextPage: Page) {
    setPage(nextPage);
    setSearch("");
    setStatus("All statuses");
    setCompany("All customers");
    setNotice("");
    setDashboardOrder(null);
  }

  function chooseWorkspace(nextRole: Role) {
    setRole(nextRole);
    navigate("Dashboard");
  }

  function switchWorkspace() {
    setRole(null);
    setSelected(null);
    setCreating(false);
    setNotice("");
  }

  function openOrder(orderId: string) {
    const order = visibleOrders.find((item) => item.id === orderId);

    if (order) {
      setSelected(order);
    }
  }

  function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const values = new FormData(event.currentTarget);

    const nextOrderNumber =
      Math.max(
        10245,
        ...orders.map((order) => Number(order.id.slice(3)))
      ) + 1;

    const newOrder: Order = {
      id: `SO-${nextOrderNumber}`,
      customer: String(values.get("customer")),
      material: String(values.get("material")).trim(),
      grade: String(values.get("grade")).trim(),
      size: String(values.get("size")).trim(),
      quantity: Number(values.get("quantity")),
      dispatched: 0,
      status: "Processing",
      date: "2026-09-24",
      due: String(values.get("due")),
    };

    if (
      !newOrder.material ||
      !newOrder.grade ||
      !newOrder.size ||
      !Number.isFinite(newOrder.quantity) ||
      newOrder.quantity <= 0
    ) {
      return;
    }

    setOrders((previous) => [newOrder, ...previous]);
    setCreating(false);
    navigate("Orders");

    setNotice(
      `${newOrder.id} created in this preview. ` +
        "Sample orders reset when the page reloads."
    );
  }

  function renderOrderTable(rows: Order[]) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order / material</th>
              {admin && <th>Customer</th>}
              <th>Ordered</th>
              <th>Dispatch progress</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((order) => {
              const progress =
                order.quantity > 0
                  ? (order.dispatched / order.quantity) * 100
                  : 0;

              return (
                <tr key={order.id}>
                  <td>
                    <button
                      className="order-link"
                      onClick={() => setSelected(order)}
                    >
                      {order.id}
                    </button>

                    <small>
                      {order.material} · {order.grade}
                    </small>
                  </td>

                  {admin && (
                    <td>
                      {order.customer}
                      <small>{date(order.date)} 2026</small>
                    </td>
                  )}

                  <td className="numeric">
                    {number(order.quantity)}{" "}
                    <small className="inline">kg</small>
                  </td>

                  <td>
                    <div className="progress-label">
                      <span>{number(order.dispatched)} kg</span>
                      <span>{Math.round(progress)}%</span>
                    </div>

                    <div className="progress">
                      <i style={{ width: `${progress}%` }} />
                    </div>
                  </td>

                  <td>
                    <Badge status={order.status} />
                  </td>

                  <td>
                    <button
                      className="icon-button"
                      aria-label={`Open ${order.id}`}
                      onClick={() => setSelected(order)}
                    >
                      <Icon name="arrow" size={17} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="empty">
            No orders match your filters.
          </div>
        )}
      </div>
    );
  }

  function renderDocuments(items: typeof documents) {
    return (
      <div>
        {items.map((document) => (
          <div className="document-row" key={document.id}>
            <div className="file-icon">
              <Icon name="file" />
            </div>

            <div className="grow">
              <strong>{document.name}</strong>

              <small>
                {document.order}
                <span>·</span>
                {date(document.date)}
                <span>·</span>
                Sample TXT
              </small>
            </div>

            <button
              className="icon-button"
              onClick={() => downloadDocument(document)}
              aria-label={`Download sample ${document.name}`}
            >
              <Icon name="down" size={18} />
            </button>
          </div>
        ))}

        {items.length === 0 && (
          <div className="empty">
            No documents found.
          </div>
        )}
      </div>
    );
  }

  function renderDeliveries(items: typeof shipments) {
    return (
      <div className="shipment-grid">
        {items.map((shipment) => (
          <article className="shipment-card" key={shipment.id}>
            <div className="panel-heading">
              <span className="soft-icon">
                <Icon name="truck" />
              </span>

              <Badge status={shipment.status} />
            </div>

            <h3>{shipment.id}</h3>

            <button
              className="order-link"
              onClick={() => openOrder(shipment.order)}
            >
              {shipment.order} →
            </button>

            <div className="route">
              <span>Venus Wires</span>
              <span className="route-line" />
              <strong>{shipment.destination}</strong>
            </div>

            <dl>
              <div>
                <dt>Quantity</dt>
                <dd>{number(shipment.quantity)} kg</dd>
              </div>

              <div>
                <dt>
                  {shipment.status === "Delivered"
                    ? "Delivered"
                    : "Expected delivery"}
                </dt>
                <dd>{date(shipment.expected)} 2026</dd>
              </div>

              <div>
                <dt>Transporter</dt>
                <dd>{shipment.carrier}</dd>
              </div>

              <div>
                <dt>Reference</dt>
                <dd>{shipment.reference}</dd>
              </div>
            </dl>

            <small>Sample tracking · Manually maintained</small>
          </article>
        ))}

        {items.length === 0 && (
          <div className="empty">
            No shipments recorded yet.
          </div>
        )}
      </div>
    );
  }
  if (role === "customer") {
    return (
      <CustomerEmailPortal
        onBack={() => setRole(null)}
      />
    );
  }
  if (!role) {
    return (
      <main className="chooser">
        <div className="chooser-brand">
          <span className="brand-mark">V</span>
          VENUS
          <span>WIRES</span>
        </div>

        <div className="chooser-content">
          <p className="eyebrow">THE CLIENT WORKSPACE</p>

          <h1>
            Better connected.
            <br />
            <span>From order to delivery.</span>
          </h1>

          <p>
            One place for your orders, shipments and documents.
            <br />
            Choose a workspace to explore the portal.
          </p>

          <div className="role-grid">
            <button onClick={() => chooseWorkspace("admin")}>
              <span className="soft-icon">
                <Icon name="grid" size={25} />
              </span>

              <h2>Admin workspace</h2>

              <p>
                Manage your customers.
                <br />
                Explore orders and deliveries.
              </p>

              <strong>
                Open admin dashboard
                <Icon name="arrow" size={18} />
              </strong>
            </button>

            <button onClick={() => chooseWorkspace("customer")}>
              <span className="soft-icon">
                <Icon name="users" size={25} />
              </span>

              <h2>Customer workspace</h2>

              <p>
                Preview your orders and documents.
                <br />
                Always within reach.
              </p>

              <strong>
                Open customer dashboard
                <Icon name="arrow" size={18} />
              </strong>
            </button>
          </div>

          <span className="preview-note">
            LOCAL DEVELOPMENT · NO LOGIN REQUIRED
          </span>
        </div>

        <footer>
          VENUS WIRES
          <span>Built around your business.</span>
        </footer>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">V</span>

          <div>
            VENUS <span>WIRES</span>
            <small>CLIENT PORTAL</small>
          </div>
        </div>

        <div className="workspace-label">
          {admin ? "ADMIN WORKSPACE" : "CUSTOMER WORKSPACE"}
        </div>

        <nav aria-label="Main navigation">
          {navigation.filter(item => !["Completed", "Archive"].includes(item)).map((item) => item === "Orders" && admin ? <OrderNavigation key="orders-group" page={page} onNavigate={navigate} admin /> : (
            <button
              key={item}
              aria-label={item}
              className={page === item ? "active" : ""}
              onClick={() => navigate(item)}
              aria-current={page === item ? "page" : undefined}
            >
              <Icon name={icons[item]} />

              <span>
                {!admin && ["Orders", "Documents"].includes(item)
                  ? `My ${item.toLowerCase()}`
                  : item}
              </span>

              {item === "Orders" && (
                <b>{visibleOrders.length}</b>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="preview-card">
            <span className="live-dot" />
            Development workspace

            <p>
              Customers, orders and documents.
              <br />
              Saved in your company database.
            </p>
          </div>

          <div className="user">
            <span className="avatar">
              {admin ? "AD" : "AI"}
            </span>

            <div>
              <strong>
                {admin ? "Administrator" : "ABC Industries"}
              </strong>

              <small>
                {admin ? "Operations team" : "Sample customer"}
              </small>
            </div>
          </div>

          <button
            className="switch"
            onClick={switchWorkspace}
            aria-label="Switch workspace"
          >
            <Icon name="exit" size={17} />
            Switch workspace
          </button>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div>
            Workspace
            <span>/</span>
            <strong>{page}</strong>
          </div>

          <div>
            <span className="preview-pill">
              {["Dashboard", "Customers", "Orders", "Documents"].includes(page)
                ? "Database records"
                : "Preview"}
            </span>

            <span className="top-date">
              {new Date().toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>

            <span className="avatar small">
              {admin ? "AD" : "AI"}
            </span>
          </div>
        </header>

        <main className="content">
          <div className="page-title">
            <div>
              <p className="eyebrow">
                {admin
                  ? "A CLEAR VIEW OF YOUR OPERATIONS"
                  : "YOUR BUSINESS, CONNECTED"}
              </p>

              <h1>
                {page === "Dashboard"
                  ? admin
                    ? "Operations overview"
                    : "Welcome, ABC Industries"
                  : page === "Profile"
                    ? "Company profile"
                    : page}
              </h1>

              <p>
                {page === "Dashboard"
                  ? "Every order. Every delivery. All in one place."
                  : page === "Customers"
                    ? "Add and manage customer records in your database."
                    : `Your ${page.toLowerCase()}, organized and easy to find.`}
              </p>
            </div>

            {admin && page === "Dashboard" && (
              <div className="dashboard-heading-actions"><button
                className="primary"
                onClick={() => navigate("Orders")}
              >
                <Icon name="box" size={18} />
                Manage orders
              </button><button type="button" className="secondary dashboard-refresh-icon" title="Refresh dashboard" aria-label="Refresh dashboard" onClick={() => setDashboardRefresh(value => value + 1)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17"/></svg></button></div>
            )}
          </div>

          {notice && (
            <div className="notice" role="status">
              {notice}
            </div>
          )}

          {/* DASHBOARD — SAMPLE DATA */}
          {page === "Dashboard" && admin && (
            <AdminDashboard
              refreshKey={dashboardRefresh}
              onNavigate={(next) => navigate(next)}
              onOpenOrder={(order) => {
                navigate("Orders");
                setDashboardOrder(order);
              }}
            />
          )}

          {/* CUSTOMERS — LIVE DATABASE */}
          {page === "Customers" && admin && (
            <CustomersPage />
          )}
          {page === "Inventory" && admin && (
            <InventoryPage />
          )}

          {/* ORDERS — SAMPLE DATA */}
          {["Orders", "Completed", "Archive"].includes(page) && admin && (
            <OrdersPage initialOrder={page === "Orders" ? dashboardOrder : null} view={page === "Archive" ? "archive" : page === "Completed" ? "completed" : "active"} />
          )}
          {page === "Orders" && !admin && (
            <section className="panel">
              <div className="filters">
                <label className="search">
                  <Icon name="search" size={18} />

                  <input
                    aria-label="Search orders"
                    placeholder="Search order, customer or material…"
                    value={search}
                    onChange={(event) =>
                      setSearch(event.target.value)
                    }
                  />
                </label>

                {admin && (
                  <select
                    aria-label="Filter by customer"
                    value={company}
                    onChange={(event) =>
                      setCompany(event.target.value)
                    }
                  >
                    <option>All customers</option>

                    {sampleCustomers.map((customer) => (
                      <option key={customer.name}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                )}

                <select
                  aria-label="Filter by status"
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value)
                  }
                >
                  <option>All statuses</option>

                  {orderStatuses.map((orderStatus) => (
                    <option key={orderStatus}>
                      {orderStatus}
                    </option>
                  ))}
                </select>
              </div>

              {renderOrderTable(filteredOrders)}

              <div className="table-footer">
                Showing {filteredOrders.length} of{" "}
                {visibleOrders.length} orders
              </div>
            </section>
          )}

          {/* DELIVERIES — SAMPLE DATA */}
          {page === "Deliveries" &&
            renderDeliveries(visibleShipments)}

          {/* DOCUMENTS — SAMPLE DATA */}
          {page === "Documents" && admin && (
            <DocumentsPage />
          )}

          {/* PROFILE — SAMPLE DATA */}
          {page === "Profile" && (
            <section className="panel profile">
              <span className="company-avatar">AI</span>

              <h2>{sampleCustomers[0].name}</h2>
              <p className="muted">Sample company profile</p>

              <dl>
                {Object.entries({
                  Location: sampleCustomers[0].city,
                  Contact: sampleCustomers[0].contact,
                  Email: sampleCustomers[0].email,
                  "Account type": "Customer",
                }).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <footer className="page-footer">
            <span>
              VENUS WIRES <span>/</span> Client portal
            </span>

            <span>
              {page === "Customers"
                ? "Customers saved in Supabase"
                : page === "Dashboard" ? "Live operations · Venus Wires" : "Sample data · September 2026"}
            </span>
          </footer>
        </main>
      </div>

      {/* ORDER DETAILS */}
      {selected && (
        <Modal
          title="detail-title"
          onClose={() => setSelected(null)}
        >
          <section className="detail-modal">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">SALES ORDER</p>
                <h2 id="detail-title">{selected.id}</h2>
                <p>{selected.customer}</p>
              </div>

              <button
                className="icon-button"
                autoFocus
                onClick={() => setSelected(null)}
                aria-label="Close order details"
              >
                <Icon name="close" />
              </button>
            </div>

            <Badge status={selected.status} />

            <div className="detail-summary">
              <div>
                <small>Order date</small>
                <strong>{date(selected.date)} 2026</strong>
              </div>

              <div>
                <small>Planned dispatch</small>
                <strong>{date(selected.due)} 2026</strong>
              </div>

              <div>
                <small>Remaining quantity</small>
                <strong>
                  {number(
                    selected.quantity - selected.dispatched
                  )}{" "}
                  kg
                </strong>
              </div>
            </div>

            <h3>Product details</h3>

            <div className="product-line">
              <Icon name="box" />

              <div>
                <strong>{selected.material}</strong>
                <small>
                  {selected.grade} · {selected.size}
                </small>
              </div>

              <strong>{number(selected.quantity)} kg</strong>
            </div>

            <h3>Deliveries</h3>

            {renderDeliveries(
              visibleShipments.filter(
                (shipment) => shipment.order === selected.id
              )
            )}

            <h3>Order documents</h3>

            {renderDocuments(
              visibleDocs.filter(
                (document) => document.order === selected.id
              )
            )}

            <button
              className="secondary"
              onClick={() => setSelected(null)}
            >
              Back to workspace
            </button>
          </section>
        </Modal>
      )}

      {/* SAMPLE ORDER FORM */}
      {creating && (
        <Modal
          title="create-title"
          onClose={() => setCreating(false)}
        >
          <section className="detail-modal create-modal">
            <div className="panel-heading">
              <div>
                <h2 id="create-title">Create a sample order</h2>
                <p>Preview only · Not saved to the backend</p>
              </div>

              <button
                className="icon-button"
                onClick={() => setCreating(false)}
                aria-label="Close create order"
              >
                <Icon name="close" />
              </button>
            </div>

            <form onSubmit={createOrder}>
              <label>
                Sample customer
                <select name="customer" autoFocus>
                  {sampleCustomers.map((customer) => (
                    <option key={customer.name}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Material
                <input
                  name="material"
                  required
                  placeholder="Stainless steel wire"
                  maxLength={100}
                />
              </label>

              <div className="form-grid">
                <label>
                  Grade
                  <input
                    name="grade"
                    required
                    placeholder="SS 304"
                    maxLength={30}
                  />
                </label>

                <label>
                  Size
                  <input
                    name="size"
                    required
                    placeholder="2.0 mm"
                    maxLength={30}
                  />
                </label>

                <label>
                  Quantity (kg)
                  <input
                    name="quantity"
                    type="number"
                    min="1"
                    max="10000000"
                    step="1"
                    required
                  />
                </label>

                <label>
                  Planned dispatch
                  <input
                    name="due"
                    type="date"
                    min="2026-09-24"
                    defaultValue="2026-09-30"
                    required
                  />
                </label>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </button>

                <button className="primary" type="submit">
                  Create sample order
                </button>
              </div>
            </form>
          </section>
        </Modal>
      )}
    </div>
  );
}