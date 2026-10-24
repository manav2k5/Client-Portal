import unittest
from unittest.mock import patch
import httpx
from fastapi.testclient import TestClient
from supabase_http import SupabaseHTTPClient
import main

class NetworkTests(unittest.TestCase):
    def test_read_retry_and_write_no_retry(self):
        for method, expected in [("GET", 2), ("POST", 1)]:
            calls = []
            def fail(request):
                calls.append(request.method)
                raise httpx.RemoteProtocolError("Server disconnected")
            with SupabaseHTTPClient(transport=httpx.MockTransport(fail)) as client:
                with self.assertRaises(httpx.RemoteProtocolError):
                    client.request(method, "https://example.test/test")
            self.assertEqual(len(calls), expected)

    def test_read_recovers(self):
        calls = []
        def handle(request):
            calls.append(request.method)
            if len(calls) == 1:
                raise httpx.ReadTimeout("timeout")
            return httpx.Response(200, json=[])
        with SupabaseHTTPClient(transport=httpx.MockTransport(handle)) as client:
            self.assertEqual(client.get("https://example.test/test").status_code, 200)
        self.assertEqual(len(calls), 2)

    def test_document_disconnect_json_and_cors(self):
        with patch.object(main, "require_local_document_mode"), patch.object(main, "check_document_order", side_effect=httpx.RemoteProtocolError("private upstream detail")):
            response = TestClient(main.app).post("/dev/orders/00000000-0000-0000-0000-000000000001/documents/list", json={}, headers={"Origin":"http://localhost:5173"})
        self.assertEqual(response.status_code, 503)
        self.assertIn("refresh", response.json()["detail"])
        self.assertNotIn("private", response.text)
        self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:5173")

    def test_write_error_message(self):
        with patch.object(main, "require_local_document_mode"), patch.object(main.supabase, "rpc", side_effect=httpx.ReadTimeout("timeout")):
            response = TestClient(main.app).post("/dev/orders/00000000-0000-0000-0000-000000000001/lifecycle", json={"action":"status", "status":"Completed", "expected_version":1})
        self.assertEqual(response.status_code, 503)
        self.assertIn("before submitting", response.json()["detail"])


class ReadOnlyRPCTests(unittest.TestCase):
    def test_document_search_connect_error_recovers(self):
        calls = []
        def handle(request):
            calls.append(request.content)
            if len(calls) < 3:
                raise httpx.ConnectError("connection unavailable")
            return httpx.Response(200, json={"items": [], "total": 0})
        with patch("supabase_http.time.sleep"), SupabaseHTTPClient(transport=httpx.MockTransport(handle)) as client:
            response = client.post("https://example.test/rest/v1/rpc/search_order_documents_v2", json={"p_search": "test"})
        self.assertEqual(response.status_code,200)
        self.assertEqual(len(calls),3)
        self.assertEqual(calls[0],calls[2])

    def test_mutating_rpc_not_retried(self):
        calls = []
        def handle(request):
            calls.append(request.method)
            raise httpx.ConnectError("connection unavailable")
        with SupabaseHTTPClient(transport=httpx.MockTransport(handle)) as client:
            with self.assertRaises(httpx.ConnectError):
                client.post("https://example.test/rest/v1/rpc/delete_order_document",json={})
        self.assertEqual(len(calls),1)

    def test_search_retries_stop(self):
        calls = []
        def handle(request):
            calls.append(request.method)
            raise httpx.ConnectError("connection unavailable")
        with patch("supabase_http.time.sleep"), SupabaseHTTPClient(transport=httpx.MockTransport(handle)) as client:
            with self.assertRaises(httpx.ConnectError):
                client.post("https://example.test/rest/v1/rpc/search_order_documents_v2",json={})
        self.assertEqual(len(calls),3)
