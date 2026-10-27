# BasuReport update - 4 easy steps

FIRST: make a backup copy of your current app.py (for example app_backup.py).

1. DATABASE
   Supabase > SQL Editor > New query > paste supabase/schema.sql > Run.
   (Safe: it only adds what is missing, it does not delete data.)

2. COPY THE FILES into your CLEAN BARANGGAY folder (same folder names):
   app.py                              (replaces yours - it only adds 2 routes)
   templates/resident_history.html
   templates/resident_settings.html
   static/css/basu_ui.css

3. ADD LINKS in templates/resident_home.html sidebar:
   <a href="{{ url_for('resident_history') }}">History</a>
   <a href="{{ url_for('resident_settings') }}">Settings</a>
   And inside <head> of every page (hides scrollbars):
   <link rel="stylesheet" href="{{ url_for('static', filename='css/basu_ui.css') }}">

4. MOVE NIGHT MODE: in every page header delete the button with
   id="theme-toggle" or id="site-theme-toggle". Night mode now lives in Settings.

RUN:  .\.venv\Scripts\python.exe app.py
CHECK: http://127.0.0.1:5000/test-db        -> must show "backend": "postgresql"
       http://127.0.0.1:5000/resident/history   (log in as a resident first)
       http://127.0.0.1:5000/resident/settings
