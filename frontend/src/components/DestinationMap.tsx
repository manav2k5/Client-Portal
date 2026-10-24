import { Component, lazy, Suspense } from "react";
import type { ReactNode } from "react";
const Map = lazy(() => import("./CustomerWorldMap"));
class MapBoundary extends Component<{children:ReactNode},{failed:boolean}> {
 state = {failed:false};
 static getDerivedStateFromError() { return {failed:true}; }
 render() { return this.state.failed ? <p role="alert" className="map-caption">Map could not load. Refresh to try again; your dashboard is still available.</p> : this.props.children; }
}
export default function DestinationMap(props: { orders:{country?:string|null}[]; company:string; compact?:boolean; mapOnly?:boolean }) {
 return <MapBoundary><Suspense fallback={<div className="map-loading" role="status">Loading destination map…</div>}><Map {...props}/></Suspense></MapBoundary>;
}
