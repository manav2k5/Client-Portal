import unittest
from unittest.mock import MagicMock, patch
from types import SimpleNamespace
from uuid import UUID
from fastapi import HTTPException
import main

class RecordManagementTests(unittest.TestCase):
    def test_wrong_confirmation_never_calls_database(self):
        with patch.object(main, "require_local_document_mode"), patch.object(main, "mutation_rpc") as rpc:
            with self.assertRaises(HTTPException) as error:
                main.delete_customer(UUID(int=1), main.DestructiveConfirmation(confirmation="yes"), MagicMock())
            self.assertEqual(error.exception.status_code,422)
            rpc.assert_not_called()

    def test_customer_delete_calls_atomic_rpc(self):
        with patch.object(main, "require_local_document_mode"), patch.object(main,"mutation_rpc",return_value={"deleted_orders":2}) as rpc:
            result=main.delete_customer(UUID(int=1), main.DestructiveConfirmation(confirmation="Delete customer"), MagicMock())
            self.assertEqual(result["deleted_orders"],2)
            self.assertEqual(rpc.call_args.args[0],"delete_customer_permanently")

    def test_failed_storage_removal_keeps_queue(self):
        query=MagicMock()
        for method in ["select","order","limit"]:
            getattr(query,method).return_value=query
        query.execute.return_value=SimpleNamespace(data=[{"id":"queue-id","storage_path":"order/file"}])
        bucket=MagicMock();bucket.remove.side_effect=RuntimeError("network unavailable")
        with patch.object(main.supabase,"table",return_value=query),patch.object(main,"document_bucket",return_value=bucket):
            main.clean_pending_document_files()
        query.delete.assert_not_called()

    def test_successful_storage_removal_acknowledges_queue(self):
        query=MagicMock()
        for method in ["select","order","limit","delete","eq"]:
            getattr(query,method).return_value=query
        query.execute.return_value=SimpleNamespace(data=[{"id":"queue-id","storage_path":"order/file"}])
        bucket=MagicMock()
        with patch.object(main.supabase,"table",return_value=query),patch.object(main,"document_bucket",return_value=bucket):
            main.clean_pending_document_files()
        bucket.remove.assert_called_once_with(["order/file"])
        query.eq.assert_called_with("id","queue-id")

    def test_document_rename_keeps_file_operation_separate(self):
        with patch.object(main, "require_local_document_mode"),patch.object(main,"mutation_rpc",return_value={}) as rpc:
            main.rename_document(UUID(int=2),main.DocumentRename(name=" Updated certificate "),MagicMock())
            self.assertEqual(rpc.call_args.args[1]["p_name"],"Updated certificate")

    def test_dev_guard_required(self):
        with patch.object(main,"require_local_document_mode",side_effect=HTTPException(404)),patch.object(main,"mutation_rpc") as rpc:
            with self.assertRaises(HTTPException):
                main.delete_document(UUID(int=2),main.DestructiveConfirmation(confirmation="Delete document"),MagicMock())
            rpc.assert_not_called()
