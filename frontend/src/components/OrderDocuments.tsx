import RecordActions from "./RecordActions";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Icon from "./Icon";

type DocumentRecord = {
  id: string;
  order_id: string;
  name: string;
  original_filename: string;
  size_bytes: number;
  created_at: string;
};

type DocumentList = {
  items: DocumentRecord[];
  total: number;
};

type Props = {
  orderId: string;
  customerEmail?: string;
  readOnly?: boolean;
};

const API =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8001";

const MAX_BYTES = 50_000_000;
const PAGE_SIZE = 20;

function readableSize(bytes: number) {
  if (bytes < 1_000_000) {
    return `${(bytes / 1_000).toFixed(1)} KB`;
  }

  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}

async function readResponse(response: Response) {
  const body = await response.json();

  if (!response.ok) {
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : "Unable to complete the request. Check the fields and retry."
    );
  }

  return body;
}

export default function OrderDocuments({
  orderId,
  customerEmail,
  readOnly = false,
}: Props) {
  const canUpload = !readOnly && customerEmail === undefined;

  const [list, setList] = useState<DocumentList>({
    items: [],
    total: 0,
  });

  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDocuments() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `${API}/dev/orders/${orderId}/documents/list`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: customerEmail ?? null,
              offset,
              limit: PAGE_SIZE,
            }),
            signal: controller.signal,
          }
        );

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

    void loadDocuments();

    return () => controller.abort();
  }, [orderId, customerEmail, offset, refresh]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const fields = new FormData(form);
    const name = String(fields.get("name") || "").trim();
    const file = fields.get("file");

    setError("");
    setMessage("");

    if (!name) {
      setError("Enter a document name.");
      return;
    }

    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a non-empty file.");
      return;
    }

    if (file.size > MAX_BYTES) {
      setError("Each file must be 50 MB or smaller.");
      return;
    }

    const body = new FormData();
    body.append("name", name);
    body.append("file", file);

    setUploading(true);

    try {
      const response = await fetch(
        `${API}/dev/orders/${orderId}/documents`,
        {
          method: "POST",
          body,
        }
      );

      // Do not set Content-Type manually for FormData.
      await readResponse(response);

      if (!alive.current) return;

      form.reset();
      setShowForm(false);
      setMessage(`${name} uploaded successfully.`);
      setOffset(0);
      setRefresh((value) => value + 1);
    } catch (err) {
      if (!alive.current) return;

      setError(
        err instanceof Error ? err.message : "Upload failed."
      );
    } finally {
      if (alive.current) setUploading(false);
    }
  }

  async function download(document: DocumentRecord) {
    setDownloading(document.id);
    setError("");

    try {
      const response = await fetch(
        `${API}/dev/orders/${orderId}/documents/${document.id}/download`,
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

      if (!alive.current) return;

      // The signed URL requests attachment download from Supabase.
      const link = window.document.createElement("a");
      link.href = result.url;
      link.download = document.original_filename;
      link.referrerPolicy = "no-referrer";

      window.document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      if (!alive.current) return;

      setError(
        err instanceof Error ? err.message : "Download failed."
      );
    } finally {
      if (alive.current) setDownloading(null);
    }
  }

  return (
    <section className="order-documents">
      <div className="order-documents-heading">
        <div>
          <h3>Documents</h3>
          <p>
            {loading
              ? "Loading documents…"
              : `${list.total} documents attached to this order`}
          </p>
        </div>

        {canUpload && (
          <button
            type="button"
            className="primary"
            disabled={uploading}
            onClick={() => {
              setShowForm((value) => !value);
              setError("");
              setMessage("");
            }}
          >
            <Icon name={showForm ? "close" : "plus"} size={17} />
            {showForm ? "Close form" : "Upload document"}
          </button>
        )}
      </div>

      {showForm && canUpload && (
        <form className="order-document-form" onSubmit={upload}>
          <label>
            Document name
            <input
              name="name"
              placeholder="For example: Invoice or Material test certificate"
              required
              maxLength={150}
              disabled={uploading}
            />
          </label>

          <label>
            File · Maximum 50 MB
            <input
              name="file"
              type="file"
              required
              disabled={uploading}
            />
          </label>

          <button
            className="primary"
            type="submit"
            disabled={uploading}
          >
            {uploading ? "Uploading…" : "Save document"}
          </button>

          {uploading && (
            <small role="status">
              Keep this order open until the upload finishes.
            </small>
          )}
        </form>
      )}

      {error && (
        <div className="customer-error" role="alert">
          {error}
          <button
            type="button"
            className="text-button"
            disabled={loading || uploading}
            onClick={() => setRefresh((value) => value + 1)}
          >
            Refresh document list
          </button>
        </div>
      )}

      {message && (
        <p className="notice" role="status">{message}</p>
      )}

      {loading ? (
        <p className="empty" role="status">Loading documents…</p>
      ) : (
        <div className="order-document-list">
          {list.items.map((document) => (
            <div className="order-document-row" key={document.id}>
              <span className="soft-icon">
                <Icon name="file" />
              </span>

              <div className="order-document-info">
                <strong>{document.name}</strong>
                <span>{document.original_filename}</span>
                <small>
                  {readableSize(document.size_bytes)}
                  {" · "}
                  {new Date(document.created_at).toLocaleDateString(
                    "en-GB"
                  )}
                </small>
              </div>

              <div className="order-document-actions">
              {canUpload && <RecordActions iconOnly id={document.id} name={document.name} kind="document" onChanged={text => {setMessage(text);setOffset(0);setRefresh(value => value+1);}} />}
              <button
                type="button"
                className="icon-button document-action-icon"
                disabled={downloading !== null}
                onClick={() => void download(document)}
                title={downloading === document.id ? "Preparing download…" : "Download document"}
                aria-busy={downloading === document.id}
                aria-label={`Download ${document.name}`}
              >
                <Icon name="down" size={16} />

              </button>
              </div>
            </div>
          ))}

          {!list.items.length && !error && (
            <p className="empty">No documents uploaded yet.</p>
          )}
        </div>
      )}

      {(list.total > PAGE_SIZE || offset > 0) && (
        <div className="order-document-pagination">
          <button
            type="button"
            className="secondary"
            disabled={loading || uploading || offset === 0}
            onClick={() =>
              setOffset(Math.max(0, offset - PAGE_SIZE))
            }
          >
            Previous
          </button>

          <span>Page {Math.floor(offset / PAGE_SIZE) + 1}</span>

          <button
            type="button"
            className="secondary"
            disabled={
              loading ||
              uploading ||
              offset + PAGE_SIZE >= list.total
            }
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}