# Venus portal dashboard preview

Run `npm run dev -- --port 5173 --strictPort`, then open http://localhost:5173.

This is a frontend-only interactive prototype. Choose Admin or Customer on the opening screen. No login, API calls, real account changes, or storage writes occur.

Implemented: blue/white responsive dashboard, customer directory, order search and customer/status filters, order details with dispatch quantities, related shipments and documents, delivery view, document search and sample text downloads, customer profile, and an admin sample-order form. Dashboard totals derive from sample data. Customer preview shows ABC Industries records only; this client-side filter is not authorization.

Sample data is in src/data.ts. The fixed reference date is 24 September 2026. Created sample orders exist in memory and reset on reload. Current sample orders have one product line; multiple product lines and shipment allocations need a relational backend implementation.

Validation: production build and ESLint. Browser smoke checks covered role selection, customer-scoped preview, order search/details, Escape dismissal, sample order creation, and narrow viewport layout.

Next implementation: company/user membership, server-enforced role and tenant authorization, multi-line orders, shipment allocations, authenticated private document downloads/uploads, and real persistence. Existing backend authentication was not modified.
