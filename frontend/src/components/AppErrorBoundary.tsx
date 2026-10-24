import { Component } from "react";
import type { ReactNode } from "react";
export default class AppErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
 state = {failed:false};
 static getDerivedStateFromError() {return {failed:true};}
 componentDidCatch(error: Error) { console.error("Portal render failed",error); }
 render() {return this.state.failed ? <main style={{padding:40}}><h1>This view could not load</h1><p>Your saved records have not been changed. Reload to reopen the portal.</p><button onClick={() => window.location.reload()}>Reload portal</button></main> : this.props.children;}
}
