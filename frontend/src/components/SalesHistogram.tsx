import { useEffect, useState } from 'react';
type Month = { month: string; quantity: number; orders: number };
const fmt=(n:number)=>n.toLocaleString('en-IN',{maximumFractionDigits:1});
export default function SalesHistogram() {
 const [period,setPeriod]=useState(12); const [selected,setSelected]=useState<string|null>(null);
 const [months,setMonths]=useState<Month[]|null>(null);const [error,setError]=useState('');const [retry,setRetry]=useState(0);
 useEffect(()=>{const controller=new AbortController();async function load(){setError('');setMonths(null);try {const response=await fetch(`${import.meta.env.VITE_API_URL||'http://127.0.0.1:8001'}/dev/admin/sales-history`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)])});const body=await response.json();if(!response.ok||!Array.isArray(body.months))throw Error('Unable to load sales history.');if(!controller.signal.aborted)setMonths(body.months);}catch{if(!controller.signal.aborted)setError('Unable to load sales history.');}}void load();return()=>controller.abort();},[retry]);
 const visible=(months||[]).slice(-period);
 const max=Math.max(1,...visible.map(m=>m.quantity));
 const total=visible.reduce((sum,m)=>sum+m.quantity,0);
 const active=visible.find(m=>m.month===selected)||visible[visible.length-1];
 const peak=visible.reduce<Month|null>((best,m)=>!best||m.quantity>best.quantity?m:best,null);
 const label=(month:string)=>new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB',{month:'short',year:'numeric'});
 return <section className="panel dispatch-insight sales-histogram sales-refined sales-combination">
  <div className="panel-heading"><div><h2>Sales performance</h2><p>Ordered volume over time</p></div><div className="sales-period" aria-label="Chart period">{[6,12].map(n=><button key={n} aria-pressed={period===n} onClick={()=>setPeriod(n)}>{n} months</button>)}</div></div>
  {error?<div className="sales-feedback" role="alert">{error}<button className="secondary" onClick={()=>setRetry(v=>v+1)}>Retry</button></div>:!months?<p className="sales-feedback" role="status">Loading sales history…</p>:<>
   <div className="sales-headline"><div><span>LAST {period} MONTHS</span><strong>{fmt(total)} <small>LBS</small></strong></div><div className="sales-peak"><span>Peak month</span><strong>{peak&&peak.quantity>0?label(peak.month):'No sales yet'}</strong><small>{peak&&peak.quantity>0?`${fmt(peak.quantity)} LBS`: 'Waiting for order volume'}</small></div></div>
   <div className="sales-legend"><span><i className="legend-bar"/>Monthly volume</span><span><i className="legend-line"/>Volume trend · same LBS scale</span></div>
   <div className="sales-chart-scroll"><div className="sales-chart"><div className="sales-axis" aria-hidden="true"><span>{fmt(max)}</span><span>{fmt(max/2)}</span><span>0 LBS</span></div><div className="sales-bars"><svg className="sales-line-overlay" viewBox="0 0 1000 161" preserveAspectRatio="none" aria-hidden="true"><polyline points={visible.map((m,i)=>`${(i+.5)/visible.length*1000},${161-m.quantity/max*161}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round"/>{visible.map((m,i)=><circle key={m.month} cx={(i+.5)/visible.length*1000} cy={161-m.quantity/max*161} r={active?.month===m.month?5:3} fill={active?.month===m.month?'#fff':'#7552ba'} stroke="#7552ba" strokeWidth="2" vectorEffect="non-scaling-stroke"/>)}</svg>{visible.map(m=><div className={`sales-month ${active?.month===m.month?'selected':''}`} key={m.month}><button className="sales-bar-track" aria-label={`${label(m.month)}: ${fmt(m.quantity)} LBS, ${m.orders} orders`} aria-pressed={active?.month===m.month} onMouseEnter={()=>setSelected(m.month)} onFocus={()=>setSelected(m.month)} onClick={()=>setSelected(m.month)}><span className={`sales-bar ${m.month===months[months.length-1]?.month?'current':''}`} style={{height:`${m.quantity/max*100}%`,minHeight:m.quantity>0?'2px':'0'}}/><span className="sales-zero" aria-hidden="true"/></button><span>{new Date(`${m.month}-01T00:00:00`).toLocaleDateString('en-GB',{month:'short'})}</span><small>{m.month.slice(0,4)}</small></div>)}</div></div></div>
   {active&&<div className="sales-selection"><span><i/>{label(active.month)}{active.month===months[months.length-1]?.month&&<small> · Month to date</small>}</span><strong>{fmt(active.quantity)} <small>LBS</small></strong><span>{active.orders} {active.orders===1?'order':'orders'}</span></div>}
   <p className="sales-chart-note">Select a month to explore · Based on SO creation date. Excludes cancelled and archived orders; includes completed orders. Current month is partial.{total===0?' No sales volume in this period.':''}</p>
  </>}
 </section>;
}
