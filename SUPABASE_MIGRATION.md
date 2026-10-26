# Move the app database to Supabase

The Flask app can use Supabase PostgreSQL as its database and continue running
on Railway. Moving the database does not move the Flask web service or uploaded
photos.

## 1. Create a Supabase project

1. Create a project in Supabase and keep its database password private.
2. Open **Project Settings → Database → Connection string** and select the
   **URI** format.
3. If the direct database host is unreachable from your network, use Supabase's
   session pooler connection string. Keep the SSL setting in the URI if it is
   provided. The app also requires SSL for Supabase connections.
4. URL-encode special characters in the database password before placing it in
   a connection URI.

## 2. Point the Flask app at Supabase

Set `SUPABASE_DB_URL` to the Supabase PostgreSQL URI in the environment where
the app runs:

- For Railway hosting, add it under the Flask service's **Variables**.
- For local development, add it to `.env` (which is ignored by Git).

Do not put the URI in source code, HTML, screenshots, or public messages. On
startup, the app creates its required PostgreSQL tables and indexes. Keep the
existing `MYSQL*` variables until the new connection and imported data have
been checked; `SUPABASE_DB_URL` takes precedence when set.

The `users` table is created if missing. For an existing project, verify that
it has the `fullname`, `email`, and `password` columns expected by this app.

## 3. Copy existing Railway MySQL data

1. Make a backup of the Railway database first.
2. Run the app against Supabase once so it creates the empty tables.
3. Stop report and account writes temporarily while exporting/importing to
   avoid losing data created during the move.
4. Export these Railway tables as UTF-8 CSV files, including their column
   headers: `users`, `reports`, `notifications`, and `announcements`.
   Login/reset OTP tables contain short-lived codes and do not need to be
   migrated; residents can request fresh codes after the switch.
5. In Supabase **Table Editor**, import each CSV into its matching existing
   table. Preserve password hashes and all IDs. Do not export or import
   database passwords in plaintext; the `users.password` values are hashes.
6. In the Supabase SQL Editor, synchronize the generated ID sequences after
   importing explicit `id` values:

   ```sql
   SELECT setval(
     pg_get_serial_sequence('public.users', 'id'),
     COALESCE((SELECT MAX(id) FROM public.users), 1),
     EXISTS (SELECT 1 FROM public.users)
   );

   SELECT setval(
     pg_get_serial_sequence('public.reports', 'id'),
     COALESCE((SELECT MAX(id) FROM public.reports), 1),
     EXISTS (SELECT 1 FROM public.reports)
   );
   ```

7. Restart the Flask service and check its logs for database initialization
   errors. Verify resident sign-in, the admin dashboard, report submission,
   status updates, notifications, and announcements before resuming writes.
8. Keep the Railway database backup until the Supabase app has been verified.
   Remove old `MYSQL*` variables only after confirming the migration.

## 4. Uploaded photos

Report rows store image filenames, while image files are stored separately in
the app's `uploads` directory. Copy the existing files to the deployment's
available uploads storage before switching databases, or old report images
will not load. Railway's local filesystem may be ephemeral; for durable image
storage, move uploads to Supabase Storage (or another persistent object store)
as a separate migration.

## Troubleshooting

- **Connection timeout:** try the Supabase session pooler URI and check the
  Supabase project is active.
- **Authentication failure:** reset the Supabase database password and update
  `SUPABASE_DB_URL` in the app's environment. Never share the URI.
- **Table or column errors:** check the app startup logs and confirm the
  imported CSV headers match the existing tables.
- **New users/reports fail after import:** rerun the sequence synchronization
  SQL above.
