type EtaItem = { id: string; current_status?: string | number | null; so_item?: string | number | null };

// Keep the existing API field so saved item data remains compatible.
export default function OrderEta({ items }: { items: EtaItem[] }) {
  if (!items.length) return <span>—</span>;
  return <div className="order-eta-list">{items.map((item, index) => (
    <span key={item.id}>
      {items.length > 1 && <strong>SO {item.so_item ?? index + 1}: </strong>}
      {String(item.current_status || "Not provided")}
    </span>
  ))}</div>;
}
