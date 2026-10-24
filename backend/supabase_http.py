import time
import httpx

# Only these audited read-only RPCs may safely be replayed after a lost response.
READ_ONLY_RPCS = frozenset({
    "/rest/v1/rpc/search_order_documents", "/rest/v1/rpc/search_order_documents_v2",
    "/rest/v1/rpc/get_admin_dashboard", "/rest/v1/rpc/get_admin_dashboard_v2",
})

class SupabaseHTTPClient(httpx.Client):
    """Bounded retries for reads, including explicitly known read-only RPCs."""
    def send(self, request: httpx.Request, **kwargs) -> httpx.Response:
        read_rpc = request.method == "POST" and request.url.path in READ_ONLY_RPCS
        attempts = 3 if read_rpc else 2 if request.method in {"GET", "HEAD"} else 1
        for attempt in range(attempts):
            try:
                return super().send(request, **kwargs)
            except httpx.TransportError:
                if attempt + 1 == attempts:
                    raise
                # Give DNS/network recovery time instead of immediately repeating.
                time.sleep(0.4 * (2 ** attempt))
        raise AssertionError("unreachable")

def create_supabase_http_client():
    return SupabaseHTTPClient(http2=False,
        timeout=httpx.Timeout(30.0, connect=10.0, pool=10.0),
        limits=httpx.Limits(max_connections=20, max_keepalive_connections=10, keepalive_expiry=5.0))
