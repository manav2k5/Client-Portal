export type Status = 'Processing' | 'Ready to dispatch' | 'Partially dispatched' | 'Delivered';
export type Order = { id: string; customer: string; material: string; grade: string; size: string; quantity: number; dispatched: number; status: Status; date: string; due: string };
export const customers = [
  { name: 'ABC Industries', city: 'Mumbai, Maharashtra', contact: 'Priya Shah', email: 'purchasing@abc.example' },
  { name: 'Precision Engineering', city: 'Pune, Maharashtra', contact: 'Rahul Mehta', email: 'orders@precision.example' },
  { name: 'Nova Manufacturing', city: 'Ahmedabad, Gujarat', contact: 'Ananya Patel', email: 'purchase@nova.example' },
  { name: 'Apex Auto Components', city: 'Chennai, Tamil Nadu', contact: 'Arjun Rao', email: 'supply@apex.example' },
];
export const initialOrders: Order[] = [
  { id: 'SO-10245', customer: 'ABC Industries', material: 'Stainless steel wire', grade: 'SS 304', size: '2.0 mm', quantity: 16000, dispatched: 6000, status: 'Partially dispatched', date: '2026-09-23', due: '2026-09-28' },
  { id: 'SO-10244', customer: 'Precision Engineering', material: 'Stainless steel bars', grade: 'SS 316', size: '12 mm', quantity: 8500, dispatched: 0, status: 'Processing', date: '2026-09-22', due: '2026-09-30' },
  { id: 'SO-10243', customer: 'Nova Manufacturing', material: 'Stainless steel wire', grade: 'SS 304L', size: '1.6 mm', quantity: 5000, dispatched: 0, status: 'Ready to dispatch', date: '2026-09-21', due: '2026-09-23' },
  { id: 'SO-10242', customer: 'ABC Industries', material: 'Stainless steel wire', grade: 'SS 316', size: '3.0 mm', quantity: 4000, dispatched: 0, status: 'Processing', date: '2026-09-20', due: '2026-10-02' },
  { id: 'SO-10241', customer: 'Apex Auto Components', material: 'Spring wire', grade: 'SS 302', size: '1.2 mm', quantity: 12000, dispatched: 12000, status: 'Delivered', date: '2026-09-17', due: '2026-09-22' },
  { id: 'SO-10240', customer: 'ABC Industries', material: 'Stainless steel bars', grade: 'SS 304', size: '8 mm', quantity: 6500, dispatched: 6500, status: 'Delivered', date: '2026-09-15', due: '2026-09-20' },
];
export const shipments = [
  { id: 'SHP-2081', order: 'SO-10245', quantity: 6000, carrier: 'Western Freight', reference: 'WF-26092481', destination: 'Mumbai', expected: '2026-09-26', status: 'In transit' },
  { id: 'SHP-2078', order: 'SO-10241', quantity: 12000, carrier: 'Southern Logistics', reference: 'SL-26092204', destination: 'Chennai', expected: '2026-09-22', status: 'Delivered' },
  { id: 'SHP-2075', order: 'SO-10240', quantity: 6500, carrier: 'Western Freight', reference: 'WF-26092017', destination: 'Mumbai', expected: '2026-09-20', status: 'Delivered' },
];
export const documents = [
  { id: 'DOC-001', name: 'Invoice · INV-2081', type: 'Invoice', order: 'SO-10245', date: '2026-09-24' },
  { id: 'DOC-002', name: 'Material test certificate · SS 304', type: 'Certificate', order: 'SO-10245', date: '2026-09-24' },
  { id: 'DOC-003', name: 'Purchase order · PO-7742', type: 'Purchase order', order: 'SO-10244', date: '2026-09-22' },
  { id: 'DOC-004', name: 'Packing list · SHP-2075', type: 'Packing list', order: 'SO-10240', date: '2026-09-20' },
  { id: 'DOC-005', name: 'Order confirmation · SO-10243', type: 'Confirmation', order: 'SO-10243', date: '2026-09-21' },
];
export const date = (value: string) => new Date(value + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
export const number = (value: number) => value.toLocaleString('en-IN');
