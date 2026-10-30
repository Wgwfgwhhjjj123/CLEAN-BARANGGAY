"""Connection selection tests without provider credentials or a live database."""
import os
import unittest
from unittest.mock import patch

import database


class DatabaseConfiguration(unittest.TestCase):
    def test_supabase_takes_precedence_and_requires_tls(self):
        with patch.dict(os.environ, {'SUPABASE_DB_URL':'postgresql://user:fake@host/postgres'}):
            with patch.object(database.psycopg, 'connect') as postgres:
                database.get_db_connection()
                self.assertEqual(postgres.call_args.kwargs['sslmode'], 'require')
                self.assertIsNone(postgres.call_args.kwargs['prepare_threshold'])

    def test_broken_supabase_does_not_fall_back_to_mysql(self):
        with patch.dict(os.environ, {'SUPABASE_DB_URL':'postgresql://user:fake@host/postgres'}):
            with patch.object(database.psycopg, 'connect', side_effect=ValueError('Invalid URI')):
                with self.assertRaises(ValueError):
                    database.get_db_connection()

    def test_missing_configuration_has_actionable_message(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, 'SUPABASE_DB_URL'):
                database.get_db_connection()

    def test_otp_table_names_are_restricted(self):
        with self.assertRaises(ValueError):
            database.otp_upsert_query('arbitrary_table')

    def test_preserve_stronger_tls_verification(self):
        with patch.dict(os.environ, {'SUPABASE_DB_URL':'postgresql://user:fake@host/postgres?sslmode=verify-full'}):
            with patch.object(database.psycopg, 'connect') as postgres:
                database.get_db_connection()
                self.assertEqual(postgres.call_args.kwargs['sslmode'], 'verify-full')
