import { useId } from "react";

// Decorative network illustration, unrelated to orders or shipment locations.
const hubs = [[120,95],[155,113],[185,145],[200,190],[235,250],[340,85],[367,110],[395,102],[425,148],[450,180],[490,150],[540,120],[580,150],[605,205],[610,260],[365,235],[323,145],[520,80]];
export default function ConnectivityMap() {
 const id = useId().replaceAll(":", "");
 const links = hubs.flatMap((point, i) => hubs.slice(i + 1).filter((_, j) => (i + j) % 3 === 0).map(end => `M${point[0]} ${point[1]} Q${(point[0] + end[0])/2} ${Math.min(point[1],end[1]) - Math.abs(point[0]-end[0])*.18} ${end[0]} ${end[1]}`));
 return <div className="decorative-connectivity-map" aria-hidden="true"><svg viewBox="40 40 640 260"><defs><filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter><pattern id={`${id}-grid`} width="18" height="18" patternUnits="userSpaceOnUse"><path d="M18 0H0V18" stroke="#1d455c" strokeWidth=".5" fill="none"/></pattern></defs><rect width="720" height="360" fill={`url(#${id}-grid)`}/><image href={`${import.meta.env.BASE_URL}maps/world.svg`} width="720" height="360"/><g fill="none" stroke="#4ae9f7" strokeWidth="2" opacity=".22" filter={`url(#${id}-glow)`}>{links.map((d,i) => <path key={i} d={d}/>)}</g><g fill="none" stroke="#65eaf6" strokeWidth=".8" opacity=".65">{links.map((d,i) => <path key={i} d={d}/>)}</g>{hubs.map(([x,y],i) => <g key={i}><circle cx={x} cy={y} r="7" fill="#70f4ff" opacity=".65" filter={`url(#${id}-glow)`}/><circle cx={x} cy={y} r="2" fill="#b4ffff"/></g>)}</svg></div>;
}
