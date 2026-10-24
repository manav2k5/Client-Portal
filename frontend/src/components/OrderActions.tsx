import Icon from "./Icon";
import { useEffect, useState } from "react";
import type { SavedOrder } from "./OrdersPage";
const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8001";
export default function OrderActions({ order, onSaved, onEdit, editDisabled }: { order: SavedOrder; onSaved: () => void; onEdit: () => void; editDisabled: boolean }) {
 const [status, setStatus] = useState(String(order.order_status || "Pending"));
 const [confirm, setConfirm] = useState(false);
 const [phrase, setPhrase] = useState("");
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState("");
 const [now, setNow] = useState(() => Date.now());
 useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
 const archived = Boolean(order.archived_at);
 const remaining = archived ? Math.max(0, new Date(String(order.archived_at)).getTime() + 72 * 3600000 - now) : 0;
 const completed = order.order_status === "Completed";
 async function save(action: string) {
   setBusy(true); setError("");
   try {
    const response = await fetch(`${API}/dev/orders/${order.id}/lifecycle`, {method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ action, status, confirmation: phrase, expected_version: order.edit_version })});
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Unable to save this change.");
    onSaved();
   } catch (e) { setError(e instanceof Error ? e.message : "Unable to save."); } finally { setBusy(false); }
 }
 return <section className="order-actions"><fieldset disabled={busy}>
 {archived ? <><p>Archived · {remaining ? `${Math.ceil(remaining / 3600000)} hours remaining to restore` : "Recovery period ended. Historical records are retained."}</p><button className="secondary" disabled={!remaining} onClick={() => save("restore")}>Restore order</button></> : <>
 <label>Order status<input list="order-status-options" maxLength={80} value={status} onChange={e => setStatus(e.target.value)} /></label>
 <datalist id="order-status-options"><option>Pending</option><option>In progress</option><option>Completed</option></datalist>
 <button className="secondary" disabled={!status.trim()} onClick={() => save("status")}>Save status</button>
 <button type="button" className="icon-button document-action-icon" title="Edit order" aria-label="Edit order" disabled={editDisabled} onClick={onEdit}><Icon name="edit" size={18} /></button>
 <button type="button" className="icon-button document-action-icon document-delete-icon" title="Delete order" aria-label="Delete order" aria-expanded={confirm} onClick={() => setConfirm(!confirm)}><Icon name="trash" size={18} /></button>
 {confirm && <div className="archive-confirm"><p>{completed ? "Move this completed order to Archive?" : 'This cancels the unfinished order. Type "Cancel order" to confirm.'} You can restore it within 72 hours. Records and documents are retained afterward.</p>{!completed && <input aria-label="Cancellation confirmation" value={phrase} onChange={e => setPhrase(e.target.value)} placeholder="Cancel order" />}<button className="primary" disabled={!completed && phrase !== "Cancel order"} onClick={() => save("archive")}>{completed ? "Confirm archive" : "Cancel and archive"}</button></div>}
 </>}{error && <p role="alert">{error}</p>}</fieldset></section>;
}
