import SalesHistogram from "./SalesHistogram";
import { DashboardNav } from "./DashboardExtras";
import OrderEta from "./OrderEta";
import AdminDestinationMap from "./AdminDestinationMap";
import { useEffect, useState } from "react";
import Icon from "./Icon";
import type { SavedOrder } from "./OrdersPage";

type RecentDocument = {
  id: string;
  order_id: string;
  name: string;
  original_filename: string;
  size_bytes: number;
  created_at: string;
  sales_order_no: string;
  customer_name: string;
};

type DashboardData = {
  stats: {
    customers: number;
    orders: number;
    open_orders: number;
    documents: number;
    completed_orders: number;
    ordered: number;
    dispatched: number;
    remaining: number;
  };
  recent_orders: SavedOrder[];
  recent_documents: RecentDocument[];
  statuses: {
    status: string;
    count: number;
  }[];
  as_of: string;
};

type Props = {
  refreshKey?: number;
  onOpenOrder: (order: SavedOrder) => void;
  onNavigate: (page: "Customers" | "Orders" | "Documents") => void;
};

const API =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8001";

function number(value: number) {
  return Number(value).toLocaleString("en-IN", {
    maximumFractionDigits: 3,
  });
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function summary(order: SavedOrder) {
  const ordered = order.sales_order_items.reduce(
    (sum, item) => sum + Number(item.order_qty_lbs ?? 0),
    0
  );

  const dispatched = order.sales_order_items.reduce(
    (sum, item) => sum + Number(item.dispatched_qty_lbs ?? 0),
    0
  );

  return {
    ordered,
    dispatched,
    progress:
      ordered > 0
        ? Math.max(0, Math.min(100, (dispatched / ordered) * 100))
        : 0,
    status: String(order.order_status || "Pending"),
  };
}

export default function AdminDashboard({
  refreshKey = 0,
  onOpenOrder,
  onNavigate,
}: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`${API}/dev/admin/dashboard`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]),
        });

        const body = await response.json();

        if (!response.ok) {
          throw new Error(
            typeof body.detail === "string"
              ? body.detail
              : "Unable to load the dashboard."
          );
        }

        if (!body || !body.stats || !Array.isArray(body.recent_orders) || !Array.isArray(body.recent_documents) || !Array.isArray(body.statuses)) {
          throw new Error("Dashboard returned incomplete data. Please refresh.");
        }
        if (!controller.signal.aborted) {
          setData(body as DashboardData);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setData(null);
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load the dashboard."
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
  }, [refresh, refreshKey]);

  async function download(item: RecentDocument) {
    setDownloading(item.id);
    setDownloadError("");

    try {
      const response = await fetch(
        `${API}/dev/orders/${item.order_id}/documents/${item.id}/download`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: null }),
        }
      );

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof body.detail === "string"
            ? body.detail
            : "Unable to download this document."
        );
      }

      const link = document.createElement("a");
      link.href = body.url;
      link.download = item.original_filename;
      link.referrerPolicy = "no-referrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : "Download failed."
      );
    } finally {
      setDownloading(null);
    }
  }

  const navigation = <DashboardNav orders={data?.recent_orders || []} documents={data?.recent_documents || []} onOpen={onOpenOrder} onNavigate={onNavigate} />;

  if (loading) {
    return (
      <div className="admin-live-dashboard">{navigation}<section className="panel">
        <div className="empty" role="status">
          Loading dashboard…
        </div>
      </section></div>
    );
  }

  if (error || !data) {
    return (
      <div className="admin-live-dashboard">{navigation}<section className="panel admin-dashboard-error">
        <p className="customer-error" role="alert">
          {error || "Dashboard unavailable."}
        </p>
        <button
          className="secondary"
          onClick={() => setRefresh((value) => value + 1)}
        >
          Retry
        </button>
      </section></div>
    );
  }

  const cards = [
    {
      label: "Customers",
      value: data.stats.customers,
      icon: "users",
      note: "Registered companies",
    },
    {
      label: "Total orders",
      value: data.stats.orders,
      icon: "box",
      note: `${number(data.stats.open_orders)} active orders`,
    },
    {
      label: "Dispatched quantity",
      value: data.stats.dispatched,
      icon: "truck",
      note: "LBS across all orders",
    },
    {
      label: "Completed orders",
      value: data.stats.completed_orders,
      icon: "file",
      note: "Explicitly marked completed",
    },
  ];

  return (
    <div className="admin-live-dashboard">{navigation}
      <div className="admin-dashboard-toolbar">
        <span>
          Updated{" "}
          {new Date(data.as_of).toLocaleString("en-GB")}
        </span>

      </div>

      <div className="stats">
        {cards.map((card, index) => (
          <article className="stat" key={card.label}>
            <div>
              <span>{card.label}</span>
              <span className="soft-icon">
                <Icon name={card.icon} />
              </span>
            </div>
            <strong>{number(card.value)}</strong>
            <small>{card.note}</small>
            {index < 2 ? <svg className="stat-art" viewBox="0 0 120 50" aria-hidden="true"><path d="M0 45H120M0 30H120M0 15H120" stroke="currentColor" opacity=".12"/><path d={index === 0 ? "M2 43L18 38L30 39L43 30L57 32L71 21L86 25L101 12L118 7" : "M8 45V30M26 45V20M44 45V26M62 45V10M80 45V18M98 45V5"} fill="none" stroke="currentColor" strokeWidth={index === 0 ? 2 : 8}/></svg> : <svg className="stat-art" viewBox="0 0 120 60" aria-label={index === 2 ? "Dispatched share of ordered quantity" : "Completed share of orders"} role="img"><path d="M15 52A45 45 0 0 1 105 52" pathLength="100" fill="none" stroke="#a8b7cc" strokeWidth="9"/><path d="M15 52A45 45 0 0 1 105 52" pathLength="100" fill="none" stroke="currentColor" strokeWidth="9" strokeDasharray={`${Math.max(0, Math.min(100, index === 2 ? (data.stats.ordered ? data.stats.dispatched / data.stats.ordered * 100 : 0) : (data.stats.orders ? data.stats.completed_orders / data.stats.orders * 100 : 0)))} 100`}/><text x="60" y="48" textAnchor="middle" fill="#274c75" fontSize="16" fontWeight="700">{Math.round(Math.max(0, Math.min(100, index === 2 ? (data.stats.ordered ? data.stats.dispatched / data.stats.ordered * 100 : 0) : (data.stats.orders ? data.stats.completed_orders / data.stats.orders * 100 : 0))))}%</text></svg>}

          </article>
        ))}
      </div>

      <div className="overview-grid">
<div className="dashboard-column">
        <section className="panel recent-orders">
          <div className="panel-heading">
            <div>
              <h2>Recent orders</h2>
              <p>Your five most recently created orders</p>
            </div>
            <button
              className="text-button"
              onClick={() => onNavigate("Orders")}
            >
              View all <Icon name="arrow" size={16} />
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order / customer</th>
                  <th>Ordered</th>
                  <th>Dispatch progress</th>
                  <th>Status</th><th>ETA</th>
                  <th><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody>
                {data.recent_orders.map((order) => {
                  const values = summary(order);

                  return (
                    <tr key={order.id}>
                      <td>
                        <button
                          className="order-link"
                          onClick={() => onOpenOrder(order)}
                        >
                          {order.sales_order_no}
                        </button>
                        <small>{order.customers?.name ?? "—"}</small>
                      </td>

                      <td className="numeric">
                        {number(values.ordered)}
                        <small className="inline"> LBS</small>
                      </td>

                      <td>
                        <div className="progress-label">
                          <span>{number(values.dispatched)} LBS</span>
                          <span>{Math.round(values.progress)}%</span>
                        </div>
                        <div
                          className="progress"
                          role="progressbar"
                          aria-label={`Dispatch progress for ${order.sales_order_no}`}
                          aria-valuenow={Math.round(values.progress)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <i style={{ width: `${values.progress}%` }} />
                        </div>
                      </td>

                      <td>
                        <span
                          className={`badge ${values.status
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, "-")}`}
                        >
                          <i />
                          {values.status}
                        </span>
                      </td>

                      <td><OrderEta items={order.sales_order_items} /></td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Open ${order.sales_order_no}`}
                          onClick={() => onOpenOrder(order)}
                        >
                          <Icon name="arrow" size={17} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!data.recent_orders.length && (
            <div className="empty">No orders created yet.</div>
          )}
        </section>

<SalesHistogram />

</div>
<div className="dashboard-column">
        <section className="panel admin-destination-map">
          <div className="panel-heading"><h2>Active order destinations</h2><Icon name="truck" /></div>
          <AdminDestinationMap />
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Recent documents</h2>
              <p>Latest files uploaded to orders</p>
            </div>
            <button
              className="text-button"
              onClick={() => onNavigate("Documents")}
            >
              View all <Icon name="arrow" size={16} />
            </button>
          </div>

          {downloadError && (
            <p className="customer-error" role="alert">
              {downloadError}
            </p>
          )}

          {data.recent_documents.map((item) => (
            <div className="document-row" key={item.id}>
              <div className="file-icon">
                <Icon name="file" />
              </div>
              <div className="grow">
                <strong>{item.name}</strong>
                <small>
                  {item.sales_order_no}
                  {" · "}
                  {item.customer_name}
                  {" · "}
                  {dateLabel(item.created_at)}
                </small>
              </div>
              <button
                className="icon-button"
                disabled={downloading !== null}
                aria-label={
                  downloading === item.id
                    ? `Preparing ${item.name}`
                    : `Download ${item.name}`
                }
                onClick={() => void download(item)}
              >
                <Icon name="down" size={18} />
              </button>
            </div>
          ))}

          {!data.recent_documents.length && (
            <div className="empty">No documents uploaded yet.</div>
          )}
        </section>
</div>
      </div>
    </div>
  );
}