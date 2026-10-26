"""Database connections for Supabase PostgreSQL and existing MySQL installs."""
import os
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from psycopg.conninfo import conninfo_to_dict
import pymysql

INTEGRITY_ERRORS = (pymysql.err.IntegrityError, psycopg.IntegrityError)


def postgres_url():
    # An explicitly configured Supabase connection always takes precedence.
    return os.getenv("SUPABASE_DB_URL", "").strip()


def using_postgres():
    return bool(postgres_url())


def get_db_connection():
    if using_postgres():
        # Disable automatic prepared statements for Supabase transaction poolers.
        # TLS is required even when a copied URI omits sslmode.
        sslmode = conninfo_to_dict(postgres_url()).get("sslmode", "require")
        if sslmode not in {"require", "verify-ca", "verify-full"}:
            sslmode = "require"
        return psycopg.connect(
            postgres_url(), sslmode=sslmode, connect_timeout=10,
            row_factory=dict_row, prepare_threshold=None,
        )

    required = ["MYSQLHOST", "MYSQLUSER", "MYSQLPASSWORD", "MYSQLDATABASE"]
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        raise RuntimeError(
            "Set SUPABASE_DB_URL for Supabase PostgreSQL, or configure MySQL: "
            + ", ".join(missing)
        )
    return pymysql.connect(
        host=os.getenv("MYSQLHOST"), port=int(os.getenv("MYSQLPORT", "3306")),
        user=os.getenv("MYSQLUSER"), password=os.getenv("MYSQLPASSWORD"),
        database=os.getenv("MYSQLDATABASE"),
        cursorclass=pymysql.cursors.DictCursor, connect_timeout=10,
        read_timeout=20, write_timeout=20, autocommit=False,
    )


def init_postgres_db():
    """Use the same schema file provided for Supabase's SQL editor."""
    schema = Path(__file__).with_name("supabase").joinpath("schema.sql").read_text()
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(schema)
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def otp_upsert_query(table):
    if table not in {"resident_login_otps", "resident_password_reset_otps"}:
        raise ValueError("Unknown OTP table")
    insert = f"""INSERT INTO {table}
        (email, otp_hash, expires_at, attempts, created_at)
        VALUES (%s, %s, %s, 0, %s)"""
    if using_postgres():
        return insert + """ ON CONFLICT (email) DO UPDATE SET
            otp_hash = EXCLUDED.otp_hash, expires_at = EXCLUDED.expires_at,
            attempts = 0, created_at = EXCLUDED.created_at"""
    return insert + """ ON DUPLICATE KEY UPDATE
        otp_hash = VALUES(otp_hash), expires_at = VALUES(expires_at),
        attempts = 0, created_at = VALUES(created_at)"""
