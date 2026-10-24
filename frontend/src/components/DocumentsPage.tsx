import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Icon from "./Icon";

type DocumentRecord = {
  id: string;
  order_id: string;
  name: string;
  original_filename: string;
  size_bytes: number;
  created_at: string;
  sales_order_no: string;
  customer_name: string;
};

type DocumentList = {
  items: DocumentRecord[];
  total: number;
};

type Props = {
  customerEmail?: string;
};

const API =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8001";

const PAGE_SIZE = 20;

function fileSize(bytes: number) {
  return bytes < 1_000_000
    ? `${(bytes / 1_000).toFixed(1)} KB`
    : `${(bytes / 1_000_000).toFixed(2)} MB`;
}

async function readResponse(response: Response) {
  const body = await response.json();

  if (!response.ok) {
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : "Unable to complete the request."
    );
  }

  return body;
}

export default function DocumentsPage({
  customerEmail,
}: Props) {
  const admin = customerEmail === undefined;

  const [list, setList] = useState<DocumentList>({
    items: [],
    total: 0,
  });

  const [searchInput, setSearchInput] = useState("");
  const [orderInput, setOrderInput] = useState("");

  const [filters, setFilters] = useState({
    search: "",
    order: "",
    offset: 0,
  });

  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`${API}/dev/documents/search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: customerEmail ?? null,
            search: filters.search,
            order_number: filters.order,
            offset: filters.offset,
            limit: PAGE_SIZE,
          }),
          signal: controller.signal,
        });

        const result: DocumentList = await readResponse(response);

        if (!controller.signal.aborted) {
          setList(result);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setList({ items: [], total: 0 });
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load documents."
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
  }, [customerEmail, filters, refresh]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setFilters({
      search: searchInput.trim(),
      order: orderInput.trim(),
      offset: 0,
    });

    setDownloadError("");
  }

  function clearFilters() {
    setSearchInput("");
    setOrderInput("");
    setFilters({ search: "", order: "", offset: 0 });
    setDownloadError("");
  }

  async function download(item: DocumentRecord) {
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
          body: JSON.stringify({
            email: customerEmail ?? null,
          }),
        }
      );

      const result: { url: string } = await readResponse(response);

      const link = document.createElement("a");
      link.href = result.url;
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

  return (
    <section className="panel documents-page">
      <div className="panel-heading">
        <div>
          <h2>{admin ? "All order documents" : "Company documents"}</h2>
          <p>
            {admin
              ? "Uploaded files across your customers and orders"
              : "Uploaded files for your company’s orders"}
          </p>
        </div>

        <button
          type="button"
          className="secondary"
          disabled={loading}
          onClick={() => {
            setFilters((previous) => ({
              ...previous,
              offset: 0,
            }));
            setRefresh((value) => value + 1);
          }}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <form className="documents-page-filters" onSubmit={applyFilters}>
        <label>
          Document name or filename
          <input
            type="search"
            value={searchInput}
            maxLength={150}
            placeholder="Search documents…"
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </label>

        <label>
          Sales order number
          <input
            type="search"
            value={orderInput}
            maxLength={100}
            placeholder="Enter all or part of an order number"
            onChange={(event) => setOrderInput(event.target.value)}
          />
        </label>

        <button className="primary" type="submit" disabled={loading}>
          Search
        </button>

        <button
          className="secondary"
          type="button"
          disabled={loading}
          onClick={clearFilters}
        >
          Clear
        </button>
      </form>

      {downloadError && (
        <p className="customer-error documents-page-error" role="alert">
          {downloadError}
        </p>
      )}

      {loading ? (
        <div className="empty" role="status">
          Loading documents…
        </div>
      ) : error ? (
        <p className="customer-error documents-page-error" role="alert">
          {error}
        </p>
      ) : !list.items.length ? (
        <div className="empty">
          <Icon name="file" size={30} />
          <h3>No documents found</h3>
          <p>
            {filters.search || filters.order
              ? "Try another search or clear the filters."
              : "Files uploaded inside orders will appear here."}
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Document</th>
                <th>Sales order</th>
                {admin && <th>Customer</th>}
                <th>Size</th>
                <th>Uploaded</th>
                <th>
                  <span className="sr-only">Download</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {list.items.map((item) => (
                <tr key={item.id}>
                  <td className="documents-page-name">
                    <strong>{item.name}</strong>
                    <small>{item.original_filename}</small>
                  </td>

                  <td>{item.sales_order_no}</td>

                  {admin && <td>{item.customer_name}</td>}

                  <td>{fileSize(item.size_bytes)}</td>

                  <td>
                    {new Date(item.created_at).toLocaleDateString(
                      "en-GB",
                      {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      }
                    )}
                  </td>

                  <td>
                    <button
                      type="button"
                      className="secondary"
                      disabled={downloading !== null}
                      aria-label={`Download ${item.name}`}
                      onClick={() => void download(item)}
                    >
                      <Icon name="down" size={16} />
                      {downloading === item.id
                        ? "Preparing…"
                        : "Download"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="documents-page-pagination">
        <button
          type="button"
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

        <span>
          {loading
            ? "Loading…"
            : error
              ? "Unable to load documents"
              : `${list.total} documents · Page ${
                  Math.floor(filters.offset / PAGE_SIZE) + 1
                }`}
        </span>

        <button
          type="button"
          className="secondary"
          disabled={
            loading ||
            Boolean(error) ||
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
  );
}