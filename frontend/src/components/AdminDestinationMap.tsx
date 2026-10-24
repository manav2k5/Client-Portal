import { useEffect, useState } from "react";
import DestinationMap from "./DestinationMap";
const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8001";
export default function AdminDestinationMap() {
 const [items,setItems] = useState<{country:string|null}[] | null>(null);
 const [error,setError] = useState("");
 const [attempt,setAttempt] = useState(0);
 useEffect(() => {
  const controller = new AbortController();
  async function load() {
   setError("");
   try {
    const response = await fetch(`${API}/dev/admin/destinations`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)])});
    const body = await response.json();
    if(!response.ok || !Array.isArray(body.items)) throw new Error("Destination map is temporarily unavailable.");
    if(!controller.signal.aborted)setItems(body.items);
   } catch { if(!controller.signal.aborted)setError("Destination map is temporarily unavailable."); }
  }
  void load();return () => controller.abort();
 },[attempt]);
 if(error) return <div className="map-loading" role="alert">{error}<button className="secondary" onClick={() => setAttempt(value=>value+1)}>Retry map</button></div>;
 if(!items) return <div className="map-loading" role="status">Loading destinations…</div>;
 return <DestinationMap orders={items} company="all customers" mapOnly/>;
}
