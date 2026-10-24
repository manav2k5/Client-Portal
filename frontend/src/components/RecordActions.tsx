import Icon from "./Icon";
import { useId, useState } from "react";
import Modal from "./Modal";
const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8001";
export default function RecordActions({ id, name, kind, onChanged, iconOnly = false }: { id: string; name: string; kind: "customer" | "document"; onChanged: (message: string) => void; iconOnly?: boolean }) {
 const [action,setAction] = useState<"rename" | "delete" | null>(null);
 const [value,setValue] = useState("");
 const [busy,setBusy] = useState(false);
 const [error,setError] = useState("");
 const title = useId();
 const phrase = kind === "customer" ? "Delete customer" : "Delete document";
 function open(next: "rename" | "delete") { setAction(next);setValue(next === "rename" ? name : "");setError(""); }
 async function submit(event: React.FormEvent) {
  event.preventDefault(); if(busy) return;
  setBusy(true);setError("");
  try {
   const response = await fetch(`${API}/dev/${kind === "customer" ? "customers" : "documents"}/${id}/${action}`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(action === "rename" ? {name:value.trim()} : {confirmation:value})});
   const body = await response.json();
   if(!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Unable to save. Refresh and try again.");
   setAction(null);
   onChanged(action === "rename" ? "Document renamed." : `${kind === "customer" ? "Customer and related records" : "Document record"} deleted. Stored file removal is queued and retried automatically while the backend is running.`);
  } catch(err) {setError(err instanceof Error ? err.message : "Unable to confirm the result. Refresh before trying again.");} finally {setBusy(false);}
 }
 return <><span className={iconOnly ? "record-actions record-actions-icons" : "record-actions"}>{kind === "document" && <button type="button" className={iconOnly ? "icon-button document-action-icon" : "secondary"} title="Rename document" aria-label={`Rename ${name}`} onClick={() => open("rename")}>{iconOnly ? <Icon name="edit" size={17}/> : "Rename"}</button>}<button type="button" className={iconOnly ? "icon-button document-action-icon document-delete-icon" : "record-delete-button"} title={phrase} aria-label={`${phrase}: ${name}`} onClick={() => open("delete")}>{iconOnly ? <Icon name="trash" size={17}/> : phrase}</button></span>
 {action && <Modal title={title} onClose={() => {if(!busy)setAction(null);}}><section className="detail-modal record-action-modal"><h2 id={title}>{action === "rename" ? "Rename document" : `Permanently delete ${kind}?`}</h2><p><strong>{name}</strong></p>
 {action === "delete" && <p className="record-delete-warning">{kind === "customer" ? "This will cancel all active orders and permanently delete this customer, all their orders, and all their uploaded documents." : "This permanently removes the document and its stored file."} This cannot be undone.</p>}
 <form onSubmit={submit}><fieldset disabled={busy}><label>{action === "rename" ? "Document name" : `Type ${phrase} to confirm`}<input autoFocus value={value} maxLength={150} onChange={e => setValue(e.target.value)} required /></label>{error && <p role="alert" className="customer-error">{error}</p>}<div className="form-actions"><button type="button" className="secondary" onClick={() => setAction(null)}>Cancel</button><button className={action === "delete" ? "record-delete-button" : "primary"} disabled={busy || (action === "delete" ? value !== phrase : !value.trim())}>{busy ? "Saving…" : action === "rename" ? "Save name" : phrase}</button></div></fieldset></form></section></Modal>}
 </>;
}
