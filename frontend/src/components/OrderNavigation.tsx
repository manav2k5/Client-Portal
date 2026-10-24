import { useState } from "react";
import Icon from "./Icon";
export default function OrderNavigation({ page, onNavigate, admin = false }: { page: string; onNavigate: (page: "Orders" | "Completed" | "Archive") => void; admin?: boolean }) {
 const [expanded, setExpanded] = useState(true);
 const active = ["Orders", "Completed", "Archive"].includes(page);
 return <div className={`order-nav-group ${active ? "is-current" : ""}`}><button className={active ? "active" : ""} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><Icon name="box" /><span>Orders</span><span className="order-nav-chevron" aria-hidden="true">{expanded ? "−" : "+"}</span></button>{expanded && <div className="order-nav-branches">{(["Orders", "Completed", ...(admin ? ["Archive"] : [])] as ("Orders" | "Completed" | "Archive")[]).map(item => <button key={item} className={page === item ? "selected" : ""} aria-current={page === item ? "page" : undefined} onClick={() => onNavigate(item)}><i aria-hidden="true" /><span>{item === "Orders" ? "Active orders" : item === "Completed" ? "Completed" : "Archive"}</span></button>)}</div>}</div>;
}
