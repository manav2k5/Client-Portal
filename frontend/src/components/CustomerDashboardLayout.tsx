import { useState } from "react";
import type { ReactNode } from "react";
import Icon from "./Icon";

type Company = {
  name: string;
  code: string;
  email: string;
  city: string;
};

type Order = {
  id: string;
  sales_order_items: {
    order_qty_lbs: number | string;
    dispatched_qty_lbs: number | string;
  }[];
};

type Page =
  | "Dashboard"
  | "Orders"
  | "Deliveries"
  | "Documents"
  | "Profile";

type Props = {
  company: Company;
  orders: Order[];
  children: ReactNode;
  busy: boolean;
  onExit: () => void;
  onNavigate: () => void;
};

const navigation: { page: Page; label: string; icon: string }[] = [
  { page: "Dashboard", label: "Dashboard", icon: "grid" },
  { page: "Orders", label: "My orders", icon: "box" },
  { page: "Deliveries", label: "Deliveries", icon: "truck" },
  { page: "Documents", label: "My documents", icon: "file" },
  { page: "Profile", label: "Company profile", icon: "users" },
];

function number(value: number) {
  return value.toLocaleString("en-IN", {
    maximumFractionDigits: 3,
  });
}

export default function CustomerDashboardLayout({
  company,
  orders,
  children,
  busy,
  onExit,
  onNavigate,
}: Props) {
  const [page, setPage] = useState<Page>("Dashboard");

  const initials =
    company.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "CW";

  const summaries = orders.map((order) => {
    const ordered = order.sales_order_items.reduce(
      (sum, item) => sum + Number(item.order_qty_lbs || 0),
      0
    );

    const dispatched = order.sales_order_items.reduce(
      (sum, item) => sum + Number(item.dispatched_qty_lbs || 0),
      0
    );

    return { ordered, dispatched };
  });

  const ordered = summaries.reduce(
    (sum, order) => sum + order.ordered,
    0
  );

  const dispatched = summaries.reduce(
    (sum, order) => sum + order.dispatched,
    0
  );

  const balance = ordered - dispatched;

  const openOrders = summaries.filter(
    (order) => order.ordered > order.dispatched
  ).length;

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
      value: number(orders.length),
      icon: "box",
      note: "Across your company",
    },
    {
      label: "Open orders",
      value: number(openOrders),
      icon: "clock",
      note: "With quantity awaiting dispatch",
    },
    {
      label: "Dispatched quantity",
      value: number(dispatched),
      icon: "truck",
      note: "LBS across all orders",
    },
    {
      label: "Remaining quantity",
      value: number(balance),
      icon: "box",
      note: "LBS awaiting dispatch",
    },
  ];

  function navigate(next: Page) {
    setPage(next);
    onNavigate();
  }

  return (
    <div className="app-shell customer-original-layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">V</span>
          <div>
            VENUS <span>WIRES</span>
            <small>CLIENT PORTAL</small>
          </div>
        </div>

        <div className="workspace-label">CUSTOMER WORKSPACE</div>

        <nav aria-label="Customer navigation">
          {navigation.map((item) => (
            <button
              key={item.page}
              className={page === item.page ? "active" : ""}
              aria-current={page === item.page ? "page" : undefined}
              onClick={() => navigate(item.page)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.page === "Orders" && <b>{orders.length}</b>}
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

          <button className="switch" disabled={busy} onClick={onExit}>
            <Icon name="exit" size={17} />
            Exit workspace
          </button>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div>
            Workspace <span>/</span> <strong>{page}</strong>
          </div>
          <div>
            <span className="preview-pill">Customer workspace</span>
            <span className="top-date">
              {new Date().toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            <span className="avatar small">{initials}</span>
          </div>
        </header>

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
          </div>

          {page === "Dashboard" && (
            <>
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
                <div className="recent-orders customer-orders-slot">
                  {children}
                </div>

                <section className="panel attention">
                  <div className="panel-heading">
                    <h2>Dispatch overview</h2>
                    <span className="soft-icon">
                      <Icon name="truck" />
                    </span>
                  </div>

                  <div className="customer-overview-body">
                    <span className="muted">Awaiting dispatch</span>
                    <strong>{number(balance)} <small>LBS</small></strong>
                    <p>
                      Across {openOrders} open
                      {openOrders === 1 ? " order" : " orders"}.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => navigate("Orders")}
                    >
                      View my orders <Icon name="arrow" size={16} />
                    </button>
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Company information</h2>
                      <p>Your registered company details</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("Profile")}
                    >
                      View profile
                    </button>
                  </div>

                  <dl className="customer-company-summary">
                    <div><dt>Company</dt><dd>{company.name}</dd></div>
                    <div><dt>Email</dt><dd>{company.email}</dd></div>
                    <div><dt>Location</dt><dd>{company.city || "—"}</dd></div>
                  </dl>
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
            </>
          )}

          {page === "Orders" && children}

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

          {(page === "Deliveries" || page === "Documents") && (
            <section className="panel">
              <div className="empty">
                <Icon
                  name={page === "Deliveries" ? "truck" : "file"}
                  size={30}
                />
                <h3>
                  {page === "Deliveries"
                    ? "Delivery tracking is not available yet"
                    : "Documents are not available yet"}
                </h3>
                <p>
                  {page === "Deliveries"
                    ? "You can view dispatched quantities in My orders."
                    : "Company documents will appear here once connected."}
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
    </div>
  );
}