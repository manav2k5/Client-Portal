export default function OrderTray<T extends { id: string; sales_order_no: string }>({ orders, onOpen, onClose }: { orders: T[]; onOpen: (order: T) => void; onClose: (id: string) => void }) {
 if (!orders.length) return null;
 return <aside className="order-tray" aria-label="Open order tabs"><span className="order-tray-label">ORDER DESK <b>{orders.length}</b></span><div className="order-tray-tabs">{orders.map(order => <div className="order-tray-tab" key={order.id}><button title={`Open ${order.sales_order_no}`} onClick={() => onOpen(order)}><span aria-hidden="true">↗</span> {order.sales_order_no}</button><button aria-label={`Close tab ${order.sales_order_no}`} onClick={() => onClose(order.id)}>×</button></div>)}</div></aside>;
}
