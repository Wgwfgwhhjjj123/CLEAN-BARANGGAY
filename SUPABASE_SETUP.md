# Run BasuReport with Supabase

This project now connects to **Supabase PostgreSQL** using `psycopg`. MySQL settings are used only when `SUPABASE_DB_URL` is empty. A configured Supabase URL that fails does not silently switch back to MySQL.

## 1. Create the tables

Open your Supabase project → **SQL Editor** → **New query**. Paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.

The script creates:

| Table | Purpose |
| --- | --- |
| `users` | Resident accounts with Werkzeug password hashes |
| `reports` | Resident-to-admin transactions, before/after photo filenames, cleanup status, rating and feedback |
| `notifications` | Report and feedback updates |
| `announcements` | Barangay announcements |
| `resident_login_otps` | Hashed login verification codes |
| `resident_password_reset_otps` | Hashed password reset codes |

The schema is repeatable and does not delete existing records. It adds the phone, deleted-report and feedback columns to an existing BasuReport reports table if needed. It expects the existing BasuReport column contract, including integer IDs, `password` hashes, `report_code` and status names; it does not convert arbitrary third-party tables.

The script enables row level security and removes browser `anon`/`authenticated` access to these private tables. Flask connects as the database owner (the `postgres` user from the Supabase Connect dialog) and enforces resident/admin permissions. These are the app's existing accounts, **not Supabase Auth users**. Do not put a database password into browser JavaScript or the Android app.

Flask also runs this same schema during startup, so the server database role must be able to create/alter its tables. Using SQL Editor first lets you confirm all six tables before running the app.

## 2. Configure your connection

1. Open Supabase → **Connect**.
2. Select **Session pooler** and copy the full PostgreSQL connection URI. This works on IPv4 networks such as many Windows home connections. Copy the exact host, username and port shown in your project; do not guess the pooler host.
3. Replace the password placeholder with your **database password**. If the password contains reserved URL characters such as `@`, `#`, `/` or `%`, URL-encode the password component before placing it in the URI. An anon/publishable key is not a database password.
4. Copy `.env.example` to `.env` in the same folder as `app.py`, and paste that complete URI after `SUPABASE_DB_URL=`.
5. Set `FLASK_SECRET_KEY`, `ADMIN_USERNAME` and `ADMIN_PASSWORD` to your own values. Generate a secret with `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
6. Configure `BREVO_API_KEY` and `MAIL_DEFAULT_SENDER` as described in `RENDER_SETUP.md` for real resident login/reset email delivery.

TLS is required by the connection code. It supports direct and pooled PostgreSQL URIs; automatic prepared statements are disabled for transaction pooler compatibility. Prefer the session pooler for this persistent Flask app.

Official connection reference: https://supabase.com/docs/guides/database/connecting-to-postgres

## 3. Start the website on Windows

Stop the old running server with **Ctrl+C** in the VS Code terminal. From the project folder, run:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

If `.venv` already exists, reuse it and run only the last two commands. Open **http://127.0.0.1:5000**.

Open **http://127.0.0.1:5000/test-db** to check the active database. Success includes `"backend": "postgresql"`. A MySQL result means `SUPABASE_DB_URL` was not loaded: check the `.env` location and restart the server. Do not share your `.env` or connection URI.

For hosted deployments, configure the same environment variables in the hosting dashboard and redeploy. A local `.env` is not automatically uploaded.

## 4. Use Transactions and Feedback

1. A resident signs up, verifies the email login code, and submits a report with the before-cleaning photo.
2. The admin opens **Transactions**, selects **Review**, and accepts or rejects it.
3. After acceptance, choose **Start cleanup**. Upload the after-cleaning photo and complete the report.
4. The resident opens **My Reports → View Details**, compares both photos, and sends a 1–5 rating and optional comment.
5. The saved rating appears in **Transactions**, **Feedback**, and the admin notification list. Each resident can rate their own completed report once.

Development Methodology has been removed. If the database is unavailable, Transactions and Feedback show a retry screen instead of a traceback; the connection must still be configured correctly to load data.

## Existing data and photos

Creating Supabase tables does **not** transfer records from MySQL or Railway. Back up and explicitly migrate existing data before switching a live installation. Preserve report codes, user password hashes, and photo filenames; do not import plaintext passwords. If you import explicit integer IDs, reset the identity sequences after the import:

```sql
SELECT setval(pg_get_serial_sequence('public.users', 'id'), COALESCE(MAX(id), 1), COUNT(*) > 0) FROM public.users;
SELECT setval(pg_get_serial_sequence('public.reports', 'id'), COALESCE(MAX(id), 1), COUNT(*) > 0) FROM public.reports;
```

Before/after image files remain in the `uploads/` directory (or `UPLOAD_FOLDER` if configured), while database rows store their filenames. Copy existing photos to the server's persistent upload directory. This change does not configure Supabase Storage. The server needs a persistent disk for uploaded photos on hosting platforms that otherwise discard local files.

The existing Android APK uses your deployed HTTPS website, so it uses whichever database that server is configured for. No database credentials go into the APK.

## Verification

The automated integration suite runs against a disposable database ending in `_test`.

- PostgreSQL: set `BASU_TEST_POSTGRES_URL` to a TLS-enabled PostgreSQL test connection URI. For the Supabase API-role privilege check, create empty `anon` and `authenticated` roles in a local test cluster if they do not already exist.
- MySQL: set `BASU_TEST_DATABASE` to a dedicated test database that already contains the original users table.

Then run `python -m unittest discover -s tests -v`. Tests mutate only the explicitly selected test database. Never use a production database for tests.
