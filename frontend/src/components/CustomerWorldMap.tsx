import { useId } from "react";
import { resolveDestination } from "./resolveDestination";
export default function CustomerWorldMap({ orders, company, compact = false, mapOnly = false }: { orders: { country?: string | null }[]; company: string; compact?: boolean; mapOnly?: boolean }) {
 const id = useId().replaceAll(":", "");
 const destinations = new Map<string, {name:string; lon:number; lat:number; count:number}>();
 const unknown = new Set<string>();
 const ambiguous = new Set<string>();
 let missing = 0;
 for (const order of orders) {
  const raw = order.country?.trim();
  if (!raw) { missing++; continue; }
  const matches = resolveDestination(raw);
  if (matches.length !== 1) { (matches.length ? ambiguous : unknown).add(raw); continue; }
  const destination = matches[0];
  const previous = destinations.get(destination.key);
  destinations.set(destination.key, {...destination, count:(previous?.count || 0)+1});
 }
 const pins = [...destinations.values()].sort((a,b) => a.name.localeCompare(b.name));
 const start = { x:(73.34+180)*2, y:(90-18.79)*2 };
 return <div className={`customer-world-map ${compact ? "map-compact" : ""} ${mapOnly ? "map-only" : ""}`}>
 <svg preserveAspectRatio="xMidYMid meet" viewBox="0 0 720 360" role="img" aria-label={`Order destinations for ${company}: ${pins.map(pin => pin.name).join(", ") || "No mapped destinations"}`}>
 <defs><pattern id={`${id}-grid`} width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#254658" strokeWidth=".5"/></pattern><filter id={`${id}-glow`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3"/></filter></defs>
 <rect width="720" height="360" fill={`url(#${id}-grid)`}/><image href={`${import.meta.env.BASE_URL}maps/world.svg`} width="720" height="360"/>
 {pins.map(pin => {
  const x=(pin.lon+180)*2, y=(90-pin.lat)*2;
  const curve=`M ${start.x} ${start.y} Q ${(start.x+x)/2} ${Math.min(start.y,y)-Math.max(25,Math.abs(start.x-x)*.2)} ${x} ${y}`;
  return <g key={pin.name}><title>{pin.name}: {pin.count} {pin.count === 1 ? "order" : "orders"}</title><path d={curve} fill="none" stroke="#46f7e4" strokeWidth="5" opacity=".35" filter={`url(#${id}-glow)`}/><path className="map-route" d={curve} fill="none" stroke="#65ffed" strokeWidth="1.4"/><circle cx={x} cy={y} r="9" fill="#ba85ff" opacity=".6" filter={`url(#${id}-glow)`}/><circle cx={x} cy={y} r="4" fill="#e1c8ff" stroke="#fff"/></g>;
 })}
 <circle cx={start.x} cy={start.y} r="11" fill="#4effe7" opacity=".7" filter={`url(#${id}-glow)`}/><circle cx={start.x} cy={start.y} r="4" fill="#78ffee" stroke="#fff"><title>Venus Wires — Khopoli, Maharashtra</title></circle>
 </svg>
 {!mapOnly && <>
 <div className="map-endpoints"><div><i/><span>VENUS WIRES<strong>Khopoli, Maharashtra</strong></span></div><span aria-hidden="true">→</span><div><i/><span>ORDER DESTINATIONS<strong>{pins.length} {pins.length === 1 ? "destination" : "destinations"}</strong></span></div></div>
 <div className="map-country-list" aria-label="Destinations">{pins.map(pin => <span key={pin.name}>{pin.name} <b>{pin.count}</b></span>)}</div>
 <p className="map-caption">Approximate destination markers · Not live shipment tracking{!orders.length ? " · No orders yet" : ""}{missing > 0 ? ` · ${missing} orders missing a destination` : ""}{ambiguous.size > 0 ? ` · Add state/country for: ${[...ambiguous].join(", ")}` : ""}{unknown.size > 0 ? ` · Unrecognized: ${[...unknown].join(", ")}` : ""}</p>
 </>}
 </div>;
}
