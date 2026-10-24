import unittest
from unittest.mock import MagicMock, patch
from types import SimpleNamespace
import main

class DashboardLoadingTests(unittest.TestCase):
    def test_dashboard_does_not_wait_for_destination_scan(self):
        with patch.object(main,"require_local_document_mode"), patch.object(main.supabase,"rpc") as rpc, patch.object(main.supabase,"table") as table:
            rpc.return_value.execute.return_value=SimpleNamespace(data={"stats":{"orders":3}})
            self.assertEqual(main.admin_dashboard(MagicMock())["stats"]["orders"],3)
            table.assert_not_called()

    def test_destination_pages_and_active_filters(self):
        query=MagicMock()
        for method in ["select","is_","neq","order","range"]:
            getattr(query,method).return_value=query
        query.execute.side_effect=[SimpleNamespace(data=[{"country":"Texas"}]*100),SimpleNamespace(data=[{"country":"India"}])]
        with patch.object(main,"require_local_document_mode"),patch.object(main.supabase,"table",return_value=query):
            self.assertEqual(len(main.admin_destinations(MagicMock())["items"]),101)
        query.is_.assert_called_with("archived_at","null")
        query.neq.assert_called_with("order_status","Completed")
        self.assertEqual(query.range.call_args_list[-1].args,(100,199))
