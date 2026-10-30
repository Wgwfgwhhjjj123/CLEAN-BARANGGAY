

from flask import (
    Flask, render_template, request, redirect,
    url_for, flash, session, send_from_directory, jsonify, Response
)
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

import os
import uuid
from database import (
    get_db_connection, using_postgres, init_postgres_db,
    otp_upsert_query, INTEGRITY_ERRORS,
)
import secrets
import requests
from dotenv import load_dotenv
from datetime import datetime, timedelta

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "change-this-secret-key")

UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER") or os.path.join(app.root_path, "uploads")
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
REPORT_COOLDOWN_SECONDS = 120

# Admin login credentials
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "basureport.admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "@admin123")


# ==================================================
# EMAIL HELPERS (HTTP API - Brevo)
# ==================================================
# Render blocks outbound SMTP ports, so emails are sent through
# Brevo's HTTPS API instead (works on port 443).
#
# Required environment variables:
#   BREVO_API_KEY        - your Brevo API key (starts with "xkeysib-")
#   MAIL_DEFAULT_SENDER  - a sender email verified in Brevo
# Optional:
#   MAIL_SENDER_NAME     - display name (default: "BasuReport")

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


def send_email(recipient_email, subject, text_content):
    api_key = os.getenv("BREVO_API_KEY")
    sender_email = os.getenv("MAIL_DEFAULT_SENDER")
    sender_name = os.getenv("MAIL_SENDER_NAME", "BasuReport")

    if not api_key or not sender_email:
        raise RuntimeError(
            "Missing BREVO_API_KEY or MAIL_DEFAULT_SENDER environment variable."
        )

    response = requests.post(
        BREVO_API_URL,
        headers={
            "api-key": api_key,
            "accept": "application/json",
            "content-type": "application/json",
        },
        json={
            "sender": {"name": sender_name, "email": sender_email},
            "to": [{"email": recipient_email}],
            "subject": subject,
            "textContent": text_content,
        },
        timeout=20,
    )

    if response.status_code not in (200, 201, 202):
        raise RuntimeError(
            f"Email API error {response.status_code}: {response.text[:300]}"
        )


def send_otp_email(recipient_email, otp):
    send_email(
        recipient_email,
        "BasuReport - Login Verification Code",
        f"""Your BasuReport verification code is: {otp}

This code expires in 5 minutes.
If you did not request this code, ignore this email.
""",
    )


def send_password_reset_email(recipient_email, otp):
    send_email(
        recipient_email,
        "BasuReport - Password Reset Code",
        f"""Your BasuReport password reset code is: {otp}

This code expires in 5 minutes.
If you did not request a password reset, ignore this email.
""",
    )


# ==================================================
# DATABASE CONNECTION
# ==================================================

def init_db():
    """Create Supabase tables or repair the existing MySQL schema."""
    if using_postgres():
        return init_postgres_db()
    connection = get_db_connection()

    try:
        with connection.cursor() as cursor:
            # The users table must already exist.
            cursor.execute("SHOW COLUMNS FROM users")
            columns = cursor.fetchall()

            id_column = next(
                (
                    column for column in columns
                    if column["Field"] == "id"
                ),
                None
            )

            if not id_column:
                raise RuntimeError(
                    "The users table must contain an integer id column."
                )

            if not any(
                column["Field"] == "last_seen_at"
                for column in columns
            ):
                cursor.execute("""
                    ALTER TABLE users
                    ADD COLUMN last_seen_at DATETIME DEFAULT NULL
                """)

            # AUTO_INCREMENT requires an index.
            cursor.execute("SHOW INDEX FROM users")
            indexes = cursor.fetchall()

            id_is_indexed = any(
                index["Column_name"] == "id"
                for index in indexes
            )
            has_primary_key = any(
                index["Key_name"] == "PRIMARY"
                for index in indexes
            )

            if not id_is_indexed:
                if not has_primary_key:
                    cursor.execute(
                        "ALTER TABLE users ADD PRIMARY KEY (id)"
                    )
                else:
                    cursor.execute("""
                        ALTER TABLE users
                        ADD UNIQUE KEY id_auto_increment_unique (id)
                    """)

            cursor.execute("""
                ALTER TABLE users
                MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS reports (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    report_code VARCHAR(40) NOT NULL UNIQUE,
                    resident_email VARCHAR(255) NOT NULL,
                    fullname VARCHAR(150) NOT NULL,
                    contact_phone VARCHAR(30) NOT NULL DEFAULT '',
                    report_date VARCHAR(30) NOT NULL,
                    report_time VARCHAR(30) NOT NULL,
                    sitio VARCHAR(255) NOT NULL,
                    description TEXT,
                    image VARCHAR(255) NOT NULL,
                    clean_image VARCHAR(255) DEFAULT NULL,
                    priority VARCHAR(20) NOT NULL DEFAULT 'Normal',
                    status VARCHAR(30) NOT NULL DEFAULT 'Pending',
                    created_at DATETIME NOT NULL,
                    completed_at DATETIME DEFAULT NULL,
                    deleted_at DATETIME DEFAULT NULL,
                    INDEX idx_report_email (resident_email),
                    INDEX idx_report_status (status),
                    INDEX idx_report_created (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            cursor.execute("SHOW COLUMNS FROM reports")
            report_columns = {
                column["Field"] for column in cursor.fetchall()
            }
            if "contact_phone" not in report_columns:
                cursor.execute("""
                    ALTER TABLE reports
                    ADD COLUMN contact_phone VARCHAR(30) NOT NULL DEFAULT ''
                    AFTER fullname
                """)
            if "deleted_at" not in report_columns:
                cursor.execute("""
                    ALTER TABLE reports
                    ADD COLUMN deleted_at DATETIME DEFAULT NULL
                """)

            for name, definition in (
                ("rating", "TINYINT UNSIGNED DEFAULT NULL"),
                ("feedback", "TEXT DEFAULT NULL"),
                ("feedback_at", "DATETIME DEFAULT NULL"),
            ):
                if name not in report_columns:
                    cursor.execute(f"ALTER TABLE reports ADD COLUMN {name} {definition}")

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS notifications (
                    id VARCHAR(64) PRIMARY KEY,
                    title VARCHAR(200) NOT NULL,
                    message TEXT NOT NULL,
                    type VARCHAR(50) NOT NULL,
                    report_id VARCHAR(40) DEFAULT NULL,
                    created_at DATETIME NOT NULL,
                    is_read TINYINT(1) NOT NULL DEFAULT 0,
                    INDEX idx_notification_created (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS announcements (
                    id VARCHAR(64) PRIMARY KEY,
                    title VARCHAR(160) NOT NULL,
                    message TEXT NOT NULL,
                    created_by VARCHAR(255) NOT NULL,
                    created_at DATETIME NOT NULL,
                    INDEX idx_announcement_created (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # NEW: stores hashed resident login OTPs.
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS resident_login_otps (
                    email VARCHAR(255) PRIMARY KEY,
                    otp_hash VARCHAR(255) NOT NULL,
                    expires_at DATETIME NOT NULL,
                    attempts INT NOT NULL DEFAULT 0,
                    created_at DATETIME NOT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)
           

           
            # Stores hashed OTPs for resident password resets.
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS resident_password_reset_otps (
                    email VARCHAR(255) PRIMARY KEY,
                    otp_hash VARCHAR(255) NOT NULL,
                    expires_at DATETIME NOT NULL,
                    attempts INT NOT NULL DEFAULT 0,
                    created_at DATETIME NOT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

        connection.commit()

    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def db_fetchone(query, params=()):
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchone()
    finally:
        connection.close()


def db_fetchall(query, params=()):
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchall()
    finally:
        connection.close()


def db_execute(query, params=()):
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


# ==================================================
# PERMANENT PHOTO STORAGE (Supabase PostgreSQL)
# Render's disk is wiped on every redeploy and restart, so photos are
# stored in the database. The disk copy is only a cache.
# ==================================================

IMAGE_MIME_TYPES = {
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
    "gif": "image/gif", "webp": "image/webp"
}
_images_table_ready = False

IMAGES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS public.uploaded_images (
    filename VARCHAR(120) PRIMARY KEY,
    mime_type VARCHAR(50) NOT NULL,
    data BYTEA NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE public.uploaded_images ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE api_role TEXT;
BEGIN
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
            EXECUTE format('REVOKE ALL ON public.uploaded_images FROM %I', api_role);
        END IF;
    END LOOP;
END $$;
"""


def ensure_images_table():
    global _images_table_ready
    if _images_table_ready:
        return
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(IMAGES_TABLE_SQL)
        connection.commit()
        _images_table_ready = True
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def save_image(file_storage, filename):
    """Store a photo permanently in the database (disk copy is a cache)."""
    ensure_images_table()
    data = file_storage.read()
    file_storage.stream.seek(0)
    extension = filename.rsplit(".", 1)[-1].lower()

    db_execute("""
        INSERT INTO public.uploaded_images (filename, mime_type, data)
        VALUES (%s, %s, %s)
        ON CONFLICT (filename) DO UPDATE
        SET mime_type = EXCLUDED.mime_type, data = EXCLUDED.data
    """, (
        filename,
        IMAGE_MIME_TYPES.get(extension, "application/octet-stream"),
        data
    ))

    try:
        with open(os.path.join(UPLOAD_FOLDER, filename), "wb") as cache_file:
            cache_file.write(data)
    except OSError:
        app.logger.warning("Could not write image cache for %s", filename)


def delete_stored_image(filename):
    """Remove a photo from the database (best effort)."""
    if not filename:
        return
    try:
        db_execute(
            "DELETE FROM public.uploaded_images WHERE filename = %s",
            (filename,)
        )
    except Exception:
        app.logger.exception("Could not delete stored image %s", filename)


# ==================================================
# HELPERS
# ==================================================

def is_ajax_request():
    return request.headers.get("X-Requested-With") == "XMLHttpRequest"


def allowed_file(filename):
    return (
        bool(filename)
        and "." in filename
        and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS
    )


def parse_datetime(value):
    if isinstance(value, datetime):
        return value
    if not value:
        return None
    return datetime.strptime(str(value), DATE_FORMAT)


def serialize_report(row):
    if not row:
        return None

    created_at = parse_datetime(row["created_at"])
    completed_at = parse_datetime(row.get("completed_at"))

    return {
        "id": row["report_code"],
        "email": row["resident_email"],
        "fullname": row["fullname"],
        "phone": row.get("contact_phone") or "",
        "date": row["report_date"],
        "time": row["report_time"],
        "sitio": row["sitio"],
        "description": row.get("description") or "",
        "image": row["image"],
        "clean_image": row.get("clean_image"),
        "rating": row.get("rating"),
        "feedback": row.get("feedback") or "",
        "feedback_at": (parse_datetime(row.get("feedback_at")).strftime(DATE_FORMAT)
                        if row.get("feedback_at") else None),
        "priority": row.get("priority") or "Normal",
        "status": row["status"],
        "created_at": created_at.strftime(DATE_FORMAT),
        "completed_at": (
            completed_at.strftime(DATE_FORMAT) if completed_at else None
        ),
        "deleted_at": (
            parse_datetime(row.get("deleted_at")).strftime(DATE_FORMAT)
            if row.get("deleted_at") else None
        )
    }


def get_all_reports():
    rows = db_fetchall(
        "SELECT * FROM reports WHERE deleted_at IS NULL "
        "ORDER BY created_at DESC, id DESC"
    )
    return [serialize_report(row) for row in rows]


def get_deleted_reports(resident_email=None):
    query = "SELECT * FROM reports WHERE deleted_at IS NOT NULL"
    params = ()
    if resident_email:
        query += " AND resident_email = %s"
        params = (resident_email,)
    query += " ORDER BY deleted_at DESC, id DESC"
    rows = db_fetchall(query, params)
    return [serialize_report(row) for row in rows]


def get_report_by_id(report_id):
    row = db_fetchone(
        "SELECT * FROM reports WHERE report_code = %s "
        "AND deleted_at IS NULL LIMIT 1",
        (report_id,)
    )
    return serialize_report(row)


def get_all_notifications():
    rows = db_fetchall(
        "SELECT * FROM notifications ORDER BY created_at DESC"
    )
    result = []

    for row in rows:
        created_at = parse_datetime(row["created_at"])
        result.append({
            "id": row["id"],
            "title": row["title"],
            "message": row["message"],
            "type": row["type"],
            "report_id": row.get("report_id"),
            "created_at": created_at.strftime(DATE_FORMAT),
            "is_read": bool(row["is_read"])
        })

    return result


def create_notification(title, message, notification_type, report_id=None):
    db_execute("""
        INSERT INTO notifications
            (id, title, message, type, report_id, created_at, is_read)
        VALUES (%s, %s, %s, %s, %s, %s, 0)
    """, (
        uuid.uuid4().hex,
        title,
        message,
        notification_type,
        report_id,
        datetime.now().strftime(DATE_FORMAT)
    ))


def get_notification_counts():
    counts = db_fetchone("""
        SELECT
            COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END), 0) AS unread
        FROM notifications
    """)
    return {
        "total": int(counts["total"]),
        "unread": int(counts["unread"])
    }


def get_report_duration(report):
    created_at = datetime.strptime(report["created_at"], DATE_FORMAT)

    if report["status"] == "Completed" and report.get("completed_at"):
        end_time = datetime.strptime(report["completed_at"], DATE_FORMAT)
    else:
        end_time = datetime.now()

    seconds = max(0, int((end_time - created_at).total_seconds()))
    days = seconds // 86400
    hours = (seconds % 86400) // 3600
    minutes = (seconds % 3600) // 60

    if days:
        return f"{days} day(s), {hours} hour(s)"
    if hours:
        return f"{hours} hour(s), {minutes} min"
    return f"{minutes} minute(s)"


def is_urgent(report):
    if report["status"] != "Pending":
        return False
    if report.get("priority") == "Urgent":
        return True

    created_at = datetime.strptime(report["created_at"], DATE_FORMAT)
    return (datetime.now() - created_at).total_seconds() >= 86400


def prepare_report(report):
    result = report.copy()
    result["duration"] = get_report_duration(report)
    result["is_urgent"] = is_urgent(report)
    result["priority"] = report.get("priority", "Normal")
    return result


def get_dashboard_counts():
    reports = get_all_reports()
    return {
        "total_reports": len(reports),
        "pending_reports": sum(r["status"] == "Pending" for r in reports),
        "accepted_reports": sum(r["status"] == "Accepted" for r in reports),
        "in_progress_reports": sum(
            r["status"] == "In Progress" for r in reports
        ),
        "completed_reports": sum(
            r["status"] == "Completed" for r in reports
        ),
        "rejected_reports": sum(r["status"] == "Rejected" for r in reports),
        "urgent_reports": sum(is_urgent(r) for r in reports)
    }


def action_response(success, message, report=None, status_code=200):
    if is_ajax_request():
        data = {"success": success, "message": message}
        if report is not None:
            data["report"] = prepare_report(report)
        try:
            data["urgent_reports"] = get_dashboard_counts()["urgent_reports"]
        except Exception:
            data["urgent_reports"] = 0
        return jsonify(data), status_code

    flash(message, "success" if success else "error")
    return redirect(url_for("admin_dashboard"))


def report_error(message, status_code=400):
    if is_ajax_request():
        return jsonify({"success": False, "message": message}), status_code
    flash(message)
    return redirect(url_for("resident_home"))


@app.after_request
def do_not_cache_pages(response):
    # Pages change depending on who is signed in, so the browser must ask the server
    # again when the Back button is used (instead of showing an old sign-in/dashboard page).
    if response.mimetype == "text/html":
        response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/sw.js")
def service_worker():
    """Serve the service worker from the site root so it controls every page."""
    response = send_from_directory(
        os.path.join(app.root_path, "static"), "sw.js",
        mimetype="application/javascript"
    )
    response.headers["Service-Worker-Allowed"] = "/"
    response.headers["Cache-Control"] = "no-cache"
    return response


@app.errorhandler(413)
def file_too_large(error):
    message = "That photo is too large. Please use a photo under 15 MB."
    if request.headers.get("X-Requested-With") == "XMLHttpRequest":
        return jsonify({"success": False, "message": message}), 413
    flash(message)
    return redirect(request.referrer or url_for("resident_home"))


# ==================================================
# HOME AND LOGIN PAGES
# ==================================================

def get_public_stats():
    """Live, site-wide numbers for the landing page (all residents' reports and ratings)."""
    empty = {"total": 0, "cleaned": 0, "avg_rating": None, "rating_count": 0}
    connection = None
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT COUNT(*) AS total, "
                "COALESCE(SUM(status = 'Completed'), 0) AS cleaned, "
                "AVG(rating) AS avg_rating, "
                "COUNT(rating) AS rating_count "
                "FROM reports WHERE deleted_at IS NULL"
            )
            row = cursor.fetchone() or {}
        return {
            "total": int(row.get("total") or 0),
            "cleaned": int(row.get("cleaned") or 0),
            "avg_rating": round(float(row["avg_rating"]), 1) if row.get("avg_rating") is not None else None,
            "rating_count": int(row.get("rating_count") or 0),
        }
    except Exception:
        app.logger.exception("Could not load public stats")
        return empty
    finally:
        if connection:
            connection.close()


@app.route("/")
def home():
    return render_template("index.html", stats=get_public_stats())


@app.route("/api/public-stats")
def public_stats():
    response = jsonify(get_public_stats())
    response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/login")
def login():
    # Already signed in? Go straight to the dashboard instead of the sign-in choice.
    if session.get("is_admin"):
        return redirect(url_for("admin_dashboard"))
    if session.get("resident_email"):
        return redirect(url_for("resident_home"))
    return render_template("login.html")


@app.route("/admin-login", methods=["GET", "POST"])
def admin_login():
    if request.method == "GET" and session.get("is_admin"):
        return redirect(url_for("admin_dashboard"))
    if request.method == "POST":
        username = request.form.get("username", "")
        password = request.form.get("password", "")

        if username == ADMIN_USERNAME and password == ADMIN_PASSWORD:
            session["is_admin"] = True
            flash("Welcome to BasuReport, Admin!", "welcome")
            return redirect(url_for("admin_dashboard"))

        flash("Invalid username or password. Please try again.", "error")
        return redirect(url_for("admin_login"))

    return render_template("admin_login.html")


# ==================================================
# ADMIN DASHBOARD AND REPORT API
# ==================================================

@app.route("/admin-dashboard")
@app.route("/admin/dashboard")
def admin_dashboard():
    if not session.get("is_admin"):
        flash("Please log in as admin first.")
        return redirect(url_for("admin_login"))
    try:
        source_reports = [prepare_report(r) for r in get_all_reports()]
    except Exception:
        app.logger.exception("Admin dashboard database error")
        flash("Could not load dashboard. Check the database connection.")
        source_reports = []

    try:
        announcement_rows = db_fetchall("""
            SELECT id, title, message, created_at
            FROM announcements
            ORDER BY created_at DESC
            LIMIT 20
        """)
        announcements = [{
            "id": row["id"],
            "title": row["title"],
            "message": row["message"],
            "created_at": parse_datetime(row["created_at"]),
            "pinned": False
        } for row in announcement_rows]
    except Exception:
        app.logger.exception("Admin dashboard announcements database error")
        flash("Could not load announcements.")
        announcements = []

    status_keys = {
        "Pending": "pending",
        "Accepted": "accepted",
        "In Progress": "in_progress",
        "Completed": "completed",
        "Rejected": "rejected"
    }
    reports = []
    report_dates = set()
    source_reports.sort(
        key=lambda report: parse_datetime(report["created_at"]),
        reverse=True
    )
    for report in source_reports:
        created_at = datetime.strptime(report["created_at"], DATE_FORMAT)
        report_dates.add(created_at.strftime("%Y-%m-%d"))
        reports.append({
            **report,
            "location": report["sitio"],
            "category": report.get("priority") or "Waste report",
            "created_at_display": created_at.strftime("%b %d, %I:%M %p"),
            "status_key": status_keys.get(report["status"], "unknown"),
        })

    total = len(source_reports)
    stats = {
        "total": total,
        "pending": sum(r["status"] == "Pending" for r in source_reports),
        "accepted": sum(r["status"] == "Accepted" for r in source_reports),
        "in_progress": sum(r["status"] == "In Progress" for r in source_reports),
        "cleaned": sum(r["status"] == "Completed" for r in source_reports),
        "rejected": sum(r["status"] == "Rejected" for r in source_reports),
        "avg_rating": (round(sum(r["rating"] for r in source_reports if r.get("rating")) /
                             sum(bool(r.get("rating")) for r in source_reports), 1)
                       if any(r.get("rating") for r in source_reports) else None)
    }
    admin_name = session.get("admin_name", "Admin")

    return render_template(
        "admin_dashboard.html",
        reports=reports,
        announcements=announcements,
        stats=stats,
        report_dates=sorted(report_dates),
        admin_name=admin_name
    )


@app.route("/admin/reports")
def admin_reports_page():
    if not session.get("is_admin"):
        flash("Please log in as admin first.")
        return redirect(url_for("admin_login"))
    return redirect(url_for("admin_dashboard") + "#reports")


@app.route("/admin/report/<report_id>")
def admin_report_detail(report_id):
    if not session.get("is_admin"):
        flash("Please log in as admin first.")
        return redirect(url_for("admin_login"))
    try:
        report = get_report_by_id(report_id)
    except Exception:
        app.logger.exception("Admin report detail database error")
        flash("Could not load this report. Check the database connection.")
        return redirect(url_for("admin_dashboard"))
    if report is None:
        flash("Report not found.")
        return redirect(url_for("admin_dashboard"))
    return render_template(
        "admin_report.html",
        report=prepare_report(report),
        admin_name=session.get("admin_name", "Admin")
    )


@app.route("/admin/residents")
def admin_residents_page():
    if not session.get("is_admin"):
        flash("Please log in as admin first.")
        return redirect(url_for("admin_login"))
    try:
        members = db_fetchall("""
            SELECT fullname, email, last_seen_at
            FROM users
            ORDER BY fullname ASC
        """)
        now = datetime.now()
        for member in members:
            last_seen = parse_datetime(member.get("last_seen_at"))
            member["online"] = bool(
                last_seen and (now - last_seen).total_seconds() <= 120
            )
            member["last_seen_display"] = (
                last_seen.strftime("%b %d, %Y %I:%M %p")
                if last_seen else "Not active yet"
            )
    except Exception:
        app.logger.exception("Admin residents page database error")
        return render_template(
            "admin_section.html",
            section="residents",
            admin_name=session.get("admin_name", "Admin"),
            page_error="Could not load residents. Check the database connection."
        ), 503
    return render_template(
        "admin_section.html",
        section="residents",
        admin_name=session.get("admin_name", "Admin"),
        members=members
    )


def render_report_section(section):
    try:
        reports = get_all_reports()
        if section == "feedback":
            reports = sorted(
                (report for report in reports if report.get("rating")),
                key=lambda report: report.get("feedback_at") or report["created_at"],
                reverse=True,
            )
        page_error = None
        status_code = 200
    except Exception:
        app.logger.exception("Could not load admin %s", section)
        reports = []
        page_error = "Unable to load reports right now. Please try again shortly."
        status_code = 503
    return render_template(
        "admin_section.html", section=section, reports=reports,
        page_error=page_error, admin_name=session.get("admin_name", "Admin"),
    ), status_code


@app.route("/admin/feedback")
def admin_feedback_page():
    if not session.get("is_admin"):
        flash("Please log in as admin first.")
        return redirect(url_for("admin_login"))
    return render_report_section("feedback")


@app.route("/admin/settings")
def admin_settings_page():
    if not session.get("is_admin"):
        flash("Please log in as admin first.")
        return redirect(url_for("admin_login"))
    return render_template(
        "admin_section.html",
        section="settings",
        admin_name=session.get("admin_name", "Admin")
    )


@app.route("/admin/expected-benefits")
@app.route("/admin/transactions")
def admin_expected_benefits_page():
    if not session.get("is_admin"):
        flash("Please log in as admin first.")
        return redirect(url_for("admin_login"))
    return render_report_section("benefits")


@app.route("/api/admin/reports")
def admin_reports_api():
    if not session.get("is_admin"):
        return jsonify({
            "success": False,
            "message": "Please log in as admin first."
        }), 401
    try:
        return jsonify({
            "reports": [prepare_report(r) for r in get_all_reports()],
            "deleted_reports": [
                prepare_report(r) for r in get_deleted_reports()
            ],
            **get_dashboard_counts()
        })
    except Exception:
        app.logger.exception("Admin reports API error")
        return jsonify({
            "success": False,
            "message": "Could not load reports."
        }), 500



# ==================================================
# ADMIN NOTIFICATIONS
# ==================================================

@app.route("/api/admin/notifications")
def admin_notifications_api():
    if not session.get("is_admin"):
        return jsonify({
            "success": False,
            "message": "Please log in as admin first."
        }), 401

    try:
        counts = get_notification_counts()
        return jsonify({
    "success": True,
    "notifications": get_all_notifications(),
    "total": counts["total"],
    "unread": counts["unread"],
})
    except Exception:
        app.logger.exception("Notification API error")
        return jsonify({
            "success": False,
            "message": "Could not load notifications."
        }), 500


@app.route("/api/admin/notifications/<notification_id>/read", methods=["POST"])
def mark_notification_read(notification_id):
    if not session.get("is_admin"):
        return jsonify({
            "success": False,
            "message": "Please log in as admin first."
        }), 401

    try:
        exists = db_fetchone(
            "SELECT id FROM notifications WHERE id = %s",
            (notification_id,)
        )

        if not exists:
            return jsonify({
                "success": False,
                "message": "Notification not found."
            }), 404

        db_execute(
            "UPDATE notifications SET is_read = 1 WHERE id = %s",
            (notification_id,)
        )

        return jsonify({
            "success": True,
            "unread": get_notification_counts()["unread"]
        })
    except Exception:
        app.logger.exception("Mark notification read error")
        return jsonify({
            "success": False,
            "message": "Could not update notification."
        }), 500


@app.route("/api/admin/notifications/read-all", methods=["POST"])
def mark_all_notifications_read():
    if not session.get("is_admin"):
        return jsonify({
            "success": False,
            "message": "Please log in as admin first."
        }), 401

    try:
        db_execute("UPDATE notifications SET is_read = 1")
        return jsonify({"success": True, "unread": 0})
    except Exception:
        app.logger.exception("Mark all notifications read error")
        return jsonify({
            "success": False,
            "message": "Could not update notifications."
        }), 500


@app.route(
    "/api/admin/notifications/<notification_id>/delete",
    methods=["POST"]
)
def delete_admin_notification(notification_id):
    if not session.get("is_admin"):
        return jsonify({
            "success": False,
            "message": "Please log in as admin first."
        }), 401

    try:
        db_execute(
            "DELETE FROM notifications WHERE id = %s",
            (notification_id,)
        )
        return jsonify({"success": True})
    except Exception:
        app.logger.exception("Delete admin notification error")
        return jsonify({
            "success": False,
            "message": "Could not delete notification."
        }), 500


@app.route("/api/admin/notifications/delete-all", methods=["POST"])
def delete_all_admin_notifications():
    if not session.get("is_admin"):
        return jsonify({
            "success": False,
            "message": "Please log in as admin first."
        }), 401

    try:
        db_execute("DELETE FROM notifications")
        return jsonify({"success": True})
    except Exception:
        app.logger.exception("Delete all admin notifications error")
        return jsonify({
            "success": False,
            "message": "Could not delete notifications."
        }), 500


@app.route("/api/admin/announcements", methods=["GET", "POST"])
def admin_announcements_api():
    if not session.get("is_admin"):
        return jsonify({
            "success": False,
            "message": "Please log in as admin first."
        }), 401

    if request.method == "POST":
        title = request.form.get("title", "").strip()
        message = request.form.get("message", "").strip()
        if not title or not message:
            return jsonify({
                "success": False,
                "message": "Enter an announcement title and message."
            }), 400
        if len(title) > 160 or len(message) > 2000:
            return jsonify({
                "success": False,
                "message": "Title must be 160 characters or less and message 2,000 characters or less."
            }), 400

        announcement = {
            "id": uuid.uuid4().hex,
            "title": title,
            "message": message,
            "created_by": "Administrator",
            "created_at": datetime.now().strftime(DATE_FORMAT)
        }
        try:
            db_execute("""
                INSERT INTO announcements
                    (id, title, message, created_by, created_at)
                VALUES (%s, %s, %s, %s, %s)
            """, (
                announcement["id"],
                title,
                message,
                announcement["created_by"],
                announcement["created_at"]
            ))
            return jsonify({
                "success": True,
                "announcement": announcement
            }), 201
        except Exception:
            app.logger.exception("Create announcement error")
            return jsonify({
                "success": False,
                "message": "Could not publish the announcement."
            }), 500

    try:
        rows = db_fetchall("""
            SELECT id, title, message, created_by, created_at
            FROM announcements
            ORDER BY created_at DESC
            LIMIT 20
        """)
        return jsonify({
            "success": True,
            "announcements": [
                {
                    "id": row["id"],
                    "title": row["title"],
                    "message": row["message"],
                    "created_by": row["created_by"],
                    "created_at": parse_datetime(
                        row["created_at"]
                    ).strftime(DATE_FORMAT)
                }
                for row in rows
            ]
        })
    except Exception:
        app.logger.exception("Load admin announcements error")
        return jsonify({
            "success": False,
            "message": "Could not load announcements."
        }), 500


@app.route("/api/admin/announcements/<announcement_id>", methods=["DELETE"])
def delete_admin_announcement_api(announcement_id):
    if not session.get("is_admin"):
        return jsonify({
            "success": False,
            "message": "Please log in as admin first."
        }), 401

    try:
        announcement = db_fetchone(
            "SELECT id FROM announcements WHERE id = %s",
            (announcement_id,)
        )
        if not announcement:
            return jsonify({
                "success": False,
                "message": "Announcement not found."
            }), 404

        db_execute(
            "DELETE FROM announcements WHERE id = %s",
            (announcement_id,)
        )
        return jsonify({"success": True})
    except Exception:
        app.logger.exception("Delete announcement error")
        return jsonify({
            "success": False,
            "message": "Could not delete the announcement."
        }), 500


@app.route("/api/resident/announcements")
def resident_announcements_api():
    if "resident_email" not in session:
        return jsonify({
            "success": False,
            "message": "Please log in first."
        }), 401

    try:
        active_after = (
            datetime.now() - timedelta(hours=24)
        ).strftime(DATE_FORMAT)
        rows = db_fetchall("""
            SELECT id, title, message, created_by, created_at
            FROM announcements
            WHERE created_at >= %s
            ORDER BY created_at DESC
            LIMIT 10
        """, (active_after,))
        # History lists every announcement (newest first), including ones
        # still inside the 24-hour "active" window, so residents never see an empty history.
        history_rows = db_fetchall("""
            SELECT id, title, message, created_by, created_at
            FROM announcements
            ORDER BY created_at DESC
            LIMIT 50
        """)

        def serialize_announcement(row):
            return {
                "id": row["id"],
                "title": row["title"],
                "message": row["message"],
                "created_by": row["created_by"],
                "created_at": parse_datetime(
                    row["created_at"]
                ).strftime(DATE_FORMAT)
            }

        return jsonify({
            "success": True,
            "announcements": [serialize_announcement(row) for row in rows],
            "history": [
                serialize_announcement(row) for row in history_rows
            ]
        })
    except Exception:
        app.logger.exception("Load resident announcements error")
        return jsonify({
            "success": False,
            "message": "Could not load announcements."
        }), 500


@app.route("/api/resident/presence", methods=["POST"])
def resident_presence_api():
    email = session.get("resident_email")
    if not email:
        return jsonify({
            "success": False,
            "message": "Please log in first."
        }), 401

    try:
        db_execute(
            "UPDATE users SET last_seen_at = %s WHERE email = %s",
            (datetime.now(), email)
        )
        return jsonify({"success": True})
    except Exception:
        app.logger.exception("Update resident presence error")
        return jsonify({
            "success": False,
            "message": "Could not update member presence."
        }), 500


@app.route("/api/admin/members")
def admin_members_api():
    if not session.get("is_admin"):
        return jsonify({
            "success": False,
            "message": "Please log in as admin first."
        }), 401

    try:
        rows = db_fetchall("""
            SELECT fullname, email, last_seen_at
            FROM users
            ORDER BY fullname ASC
        """)
        now = datetime.now()
        members = []
        for row in rows:
            last_seen = parse_datetime(row.get("last_seen_at"))
            online = bool(
                last_seen
                and (now - last_seen).total_seconds() <= 120
            )
            members.append({
                "fullname": row["fullname"],
                "email": row["email"],
                "online": online,
                "last_seen_at": (
                    last_seen.strftime(DATE_FORMAT) if last_seen else None
                )
            })
        return jsonify({
            "success": True,
            "members": members,
            "online": sum(member["online"] for member in members),
            "total": len(members)
        })
    except Exception:
        app.logger.exception("Load admin members error")
        return jsonify({
            "success": False,
            "message": "Could not load member presence."
        }), 500


# ==================================================
# ADMIN: START CLEANING
# ==================================================

@app.route("/api/admin/reports/<report_id>/decision", methods=["POST"])
def decide_report(report_id):
    if not session.get("is_admin"):
        return jsonify({
            "success": False,
            "message": "Please log in as admin first."
        }), 401

    decision = request.form.get("decision", "").strip().lower()
    status = {"accept": "Accepted", "reject": "Rejected"}.get(decision)
    if not status:
        return jsonify({
            "success": False,
            "message": "Choose whether to accept or reject this report."
        }), 400

    try:
        report = get_report_by_id(report_id)
        if report is None:
            return jsonify({
                "success": False,
                "message": "Report not found."
            }), 404
        if report["status"] != "Pending":
            return jsonify({
                "success": False,
                "message": "Only pending reports can be accepted or rejected."
            }), 400

        db_execute(
            "UPDATE reports SET status = %s WHERE report_code = %s "
            "AND deleted_at IS NULL AND status = 'Pending'",
            (status, report_id)
        )
        report["status"] = status
        if status == "Accepted":
            create_notification(
                "Report Accepted",
                f"Your report {report_id} was accepted. The cleanup team will begin soon.",
                "accepted",
                report_id
            )
        else:
            create_notification(
                "Report Rejected",
                f"Your report {report_id} was reviewed and rejected.",
                "rejected",
                report_id
            )
        return jsonify({
            "success": True,
            "message": f"Report {status.lower()}.",
            "report": prepare_report(report)
        })
    except Exception:
        app.logger.exception("Report decision error")
        return jsonify({
            "success": False,
            "message": "Could not update the report decision."
        }), 500


@app.route("/start-cleaning/<report_id>", methods=["POST"])
def start_cleaning(report_id):
    if not session.get("is_admin"):
        return action_response(
            False, "Please log in as admin first.", status_code=401
        )
    try:
        report = get_report_by_id(report_id)

        if report is None:
            return action_response(
                False, "Report not found.", status_code=404
            )

        if report["status"] in ("Completed", "Rejected"):
            return action_response(
                False, "This report cannot be started.", report, 400
            )

        if report["status"] == "In Progress":
            return action_response(
                True, "This report is already being cleaned.", report
            )

        if report["status"] != "Accepted":
            return action_response(
                False, "Accept this report before starting cleanup.", report, 400
            )

        db_execute(
            "UPDATE reports SET status = %s WHERE report_code = %s",
            ("In Progress", report_id)
        )

        report["status"] = "In Progress"

        create_notification(
            "Cleaning Started",
            f"Cleaning has started for report {report_id}.",
            "in_progress",
            report_id
        )

        return action_response(
            True, "Report status updated to In Progress!", report
        )

    except Exception:
        app.logger.exception("Start cleaning error")
        return action_response(
            False,
            "Could not update report. Check the database.",
            status_code=500
        )


# ==================================================
# ADMIN: COMPLETE REPORT
# ==================================================

@app.route("/complete-report/<report_id>", methods=["POST"])
def complete_report(report_id):
    if not session.get("is_admin"):
        return action_response(
            False, "Please log in as admin first.", status_code=401
        )
    try:
        report = get_report_by_id(report_id)

        if report is None:
            return action_response(
                False, "Report not found.", status_code=404
            )

        if report["status"] == "Completed":
            return action_response(
                False, "This report is already completed.", report, 400
            )

        if report["status"] != "In Progress":
            return action_response(
                False, "Start cleaning before completing this report.", report, 400
            )

        image = request.files.get("clean-image")

        if not image or not image.filename:
            return action_response(
                False,
                "Please upload an after-cleaning photo.",
                report,
                400
            )

        if not allowed_file(image.filename):
            return action_response(
                False,
                "Invalid image format. Use JPG, JPEG, PNG, GIF, or WEBP.",
                report,
                400
            )

        original_filename = secure_filename(image.filename)

        if "." not in original_filename:
            return action_response(
                False, "Invalid image filename.", report, 400
            )

        extension = original_filename.rsplit(".", 1)[1].lower()
        filename = f"clean_{uuid.uuid4().hex}.{extension}"
        save_image(image, filename)

        completed_at = datetime.now().strftime(DATE_FORMAT)

        db_execute("""
            UPDATE reports
            SET clean_image = %s, status = %s, completed_at = %s
            WHERE report_code = %s
        """, (filename, "Completed", completed_at, report_id))

        report["clean_image"] = filename
        report["status"] = "Completed"
        report["completed_at"] = completed_at

        create_notification(
            "Report Completed",
            f"Report {report_id} has been successfully completed.",
            "completed",
            report_id
        )

        return action_response(
            True, "Report completed successfully!", report
        )

    except Exception:
        app.logger.exception("Complete report error")
        return action_response(
            False,
            "Could not complete report. Check the database.",
            status_code=500
        )

# ==================================================
# RESIDENT SIGNUP
# ==================================================

@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "GET" and session.get("resident_email"):
        return redirect(url_for("resident_home"))
    if request.method == "POST":
        fullname = request.form.get("fullname", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        confirm_password = request.form.get("confirm_password", "")

        if not fullname or not email or not password:
            flash("Please complete all required fields.")
            return render_template("signup.html")

        if password != confirm_password:
            flash("Passwords do not match.")
            return render_template("signup.html")

        if len(password) < 8:
            flash("Password must be at least 8 characters.")
            return render_template("signup.html")

        if not (
            any(character.islower() for character in password)
            and any(character.isupper() for character in password)
            and any(character.isdigit() for character in password)
            and any(not character.isalnum() for character in password)
        ):
            flash(
                "Use a strong password with lowercase and uppercase letters, "
                "a number, and a symbol."
            )
            return render_template("signup.html")

        try:
            existing = db_fetchone(
                "SELECT id FROM users WHERE email = %s LIMIT 1",
                (email,)
            )

            if existing:
                flash("Email is already registered.")
                return render_template("signup.html")

            db_execute("""
                INSERT INTO users (fullname, email, password)
                VALUES (%s, %s, %s)
            """, (
                fullname,
                email,
                generate_password_hash(password)
            ))

            flash(f"Welcome to BasuReport, {fullname}! Your account was created. You can now log in.")
            return redirect(url_for("resident_login"))

        except INTEGRITY_ERRORS:
            flash("Email is already registered.")
        except Exception:
            app.logger.exception("Signup database error")
            flash("Could not create account. Check database settings.")

    return render_template("signup.html")


# ==================================================
# RESIDENT LOGIN — SEND OTP
# ==================================================

@app.route("/resident-login", methods=["GET", "POST"])
def resident_login():
    if request.method == "GET" and session.get("resident_email"):
        return redirect(url_for("resident_home"))
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        try:
            resident = db_fetchone("""
                SELECT id, fullname, email, password
                FROM users
                WHERE email = %s
                LIMIT 1
            """, (email,))
        except Exception:
            app.logger.exception("Resident login database error")
            flash("Database connection failed. Please try again.")
            return render_template("resident_login.html")

        if not resident or not check_password_hash(
            resident["password"], password
        ):
            flash("Invalid email or password. Please try again.", "error")
            return render_template("resident_login.html")

        otp = f"{secrets.randbelow(1000000):06d}"
        otp_hash = generate_password_hash(otp)
        now = datetime.now()
        expires_at = now + timedelta(minutes=5)

        try:
            db_execute(otp_upsert_query("resident_login_otps"), (
                email,
                otp_hash,
                expires_at,
                now
            ))

            send_otp_email(email, otp)

            session.clear()
            session["pending_resident_email"] = email

            flash("A 6-digit verification code was sent to your email.")
            return redirect(url_for("verify_resident_otp"))

        except Exception:
            app.logger.exception("Could not send resident OTP")

            try:
                db_execute(
                    "DELETE FROM resident_login_otps WHERE email = %s",
                    (email,)
                )
            except Exception:
                app.logger.exception("Could not remove failed OTP")

            flash("Could not send the verification code. Please try again later.")
            return render_template("resident_login.html")

    return render_template("resident_login.html")


# ==================================================
# VERIFY RESIDENT OTP
# ==================================================

@app.route("/verify-resident-otp", methods=["GET", "POST"])
def verify_resident_otp():
    if session.get("resident_email"):
        return redirect(url_for("resident_home"))

    email = session.get("pending_resident_email")

    if not email:
        flash("Please log in first.")
        return redirect(url_for("resident_login"))

    if request.method == "POST":
        otp = request.form.get("otp", "").strip()

        if len(otp) != 6 or not otp.isdigit():
            flash("Enter the 6-digit verification code.")
            return render_template("resident_otp.html")

        try:
            record = db_fetchone("""
                SELECT email, otp_hash, expires_at, attempts
                FROM resident_login_otps
                WHERE email = %s
                LIMIT 1
            """, (email,))

            if not record:
                session.pop("pending_resident_email", None)
                flash("Verification code not found. Please log in again.")
                return redirect(url_for("resident_login"))

            expiry = record["expires_at"]

            if isinstance(expiry, str):
                expiry = datetime.fromisoformat(expiry)

            if expiry < datetime.now():
                db_execute(
                    "DELETE FROM resident_login_otps WHERE email = %s",
                    (email,)
                )
                session.pop("pending_resident_email", None)
                flash("Your code has expired. Please log in again.")
                return redirect(url_for("resident_login"))

            if record["attempts"] >= 5:
                db_execute(
                    "DELETE FROM resident_login_otps WHERE email = %s",
                    (email,)
                )
                session.pop("pending_resident_email", None)
                flash("Too many attempts. Please log in again.")
                return redirect(url_for("resident_login"))

            if not check_password_hash(record["otp_hash"], otp):
                db_execute("""
                    UPDATE resident_login_otps
                    SET attempts = attempts + 1
                    WHERE email = %s
                """, (email,))

                flash("Incorrect verification code. Please try again.")
                return render_template("resident_otp.html")

            resident = db_fetchone("""
                SELECT id, fullname, email
                FROM users
                WHERE email = %s
                LIMIT 1
            """, (email,))

            db_execute(
                "DELETE FROM resident_login_otps WHERE email = %s",
                (email,)
            )

            if not resident:
                session.clear()
                flash("Resident account not found. Please log in again.")
                return redirect(url_for("resident_login"))

            session.clear()
            session["resident_id"] = resident["id"]
            session["resident_email"] = resident["email"]
            session["resident_name"] = resident["fullname"]

            flash(f"Welcome to BasuReport, {resident['fullname']}!")
            return redirect(url_for("resident_home"))

        except Exception:
            app.logger.exception("Resident OTP verification error")
            flash("Could not verify the code. Please try again.")

    return render_template("resident_otp.html")


# ==================================================
# RESIDENT DASHBOARD
# ==================================================

@app.route("/resident-home")
def resident_home():
    if "resident_email" not in session:
        return redirect(url_for("resident_login"))

    try:
        reports = [
            prepare_report(report)
            for report in get_all_reports()
            if report["email"] == session["resident_email"]
        ]
    except Exception:
        app.logger.exception("Resident dashboard database error")
        flash("Could not load your reports.")
        reports = []

    return render_template(
        "resident_home.html",
        reports=reports,
        resident_name=session.get("resident_name", "")
    )


@app.route("/resident/settings")
def resident_settings():
    if "resident_email" not in session:
        return redirect(url_for("resident_login"))
    return render_template("resident_settings.html")


@app.route("/resident/history")
def resident_history():
    if "resident_email" not in session:
        return redirect(url_for("resident_login"))
    return render_template("resident_history.html")


@app.context_processor
def feedback_form_token():
    if "feedback_token" not in session:
        session["feedback_token"] = secrets.token_urlsafe(32)
    return {"feedback_token": session["feedback_token"]}


@app.route("/resident/report/<report_id>")
def resident_report_detail(report_id):
    if "resident_email" not in session:
        return redirect(url_for("resident_login"))
    report = get_report_by_id(report_id)
    if not report or report["email"] != session["resident_email"]:
        return "Report not found.", 404
    return render_template("report_detail.html", report=prepare_report(report))


@app.route("/api/resident/reports/<report_id>/feedback", methods=["POST"])
def submit_report_feedback(report_id):
    email = session.get("resident_email")
    if not email:
        return jsonify(success=False, message="Please log in first."), 401
    expected_token = session.get("feedback_token")
    if not expected_token or not secrets.compare_digest(
        request.form.get("feedback_token", "").encode(), expected_token.encode()
    ):
        return jsonify(success=False, message="Please reload this page and try again."), 403
    rating_text = request.form.get("rating", "")
    feedback = request.form.get("feedback", "").strip()
    if rating_text not in {"1", "2", "3", "4", "5"} or len(feedback) > 500:
        return jsonify(success=False, message="Choose 1–5 stars and keep comments within 500 characters."), 400
    connection = None
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            # Lock the row so simultaneous submissions cannot replace a saved rating.
            cursor.execute("SELECT * FROM reports WHERE report_code = %s AND resident_email = %s "
                           "AND deleted_at IS NULL FOR UPDATE", (report_id, email))
            row = cursor.fetchone()
            if not row:
                return jsonify(success=False, message="Report not found."), 404
            if row["status"] != "Completed":
                return jsonify(success=False, message="Feedback is available after cleanup is completed."), 409
            if row.get("rating") is not None:
                return jsonify(success=False, message="Feedback has already been submitted."), 409
            now = datetime.now().strftime(DATE_FORMAT)
            cursor.execute("UPDATE reports SET rating = %s, feedback = %s, feedback_at = %s "
                           "WHERE report_code = %s", (int(rating_text), feedback, now, report_id))
            cursor.execute("INSERT INTO notifications "
                           "(id, title, message, type, report_id, created_at, is_read) "
                           "VALUES (%s, %s, %s, 'feedback', %s, %s, 0)",
                           (uuid.uuid4().hex, "New resident feedback",
                            f"Report {report_id} received {rating_text}/5 stars.", report_id, now))
        connection.commit()
        return jsonify(success=True, message="Thank you! Your feedback has been sent to the barangay.")
    except Exception:
        if connection:
            connection.rollback()
        app.logger.exception("Feedback submission failed")
        return jsonify(success=False, message="Could not save feedback. Please try again."), 500
    finally:
        if connection:
            connection.close()


@app.route("/api/resident/reports")
def resident_reports_api():
    if "resident_email" not in session:
        return jsonify({
            "success": False,
            "message": "Please log in first."
        }), 401

    try:
        reports = [
            prepare_report(report)
            for report in get_all_reports()
            if report["email"] == session["resident_email"]
        ]
        deleted_reports = [
            prepare_report(report)
            for report in get_deleted_reports(session["resident_email"])
        ]

        return jsonify({
            "success": True,
            "reports": reports,
            "deleted_reports": deleted_reports,
            "total_reports": len(reports),
            "pending_reports": sum(
                r["status"] == "Pending" for r in reports
            ),
            "in_progress_reports": sum(
                r["status"] == "In Progress" for r in reports
            ),
            "completed_reports": sum(
                r["status"] == "Completed" for r in reports
            )
        })
    except Exception:
        app.logger.exception("Resident reports API error")
        return jsonify({
            "success": False,
            "message": "Could not load reports."
        }), 500


@app.route("/api/admin/reports/<report_id>/delete", methods=["POST"])
def delete_admin_report(report_id):
    if not session.get("is_admin"):
        return jsonify({
            "success": False,
            "message": "Please log in as admin first."
        }), 401
    return update_report_deleted_state(report_id, deleted=True)


@app.route("/api/admin/reports/<report_id>/restore", methods=["POST"])
def restore_admin_report(report_id):
    if not session.get("is_admin"):
        return jsonify({
            "success": False,
            "message": "Please log in as admin first."
        }), 401
    return update_report_deleted_state(report_id, deleted=False)


@app.route(
    "/api/admin/reports/<report_id>/permanent-delete", methods=["POST"]
)
def permanently_delete_admin_report(report_id):
    if not session.get("is_admin"):
        return jsonify({
            "success": False,
            "message": "Please log in as admin first."
        }), 401
    return permanently_delete_report(report_id)


@app.route("/api/resident/reports/<report_id>/delete", methods=["POST"])
def delete_resident_report(report_id):
    email = session.get("resident_email")
    if not email:
        return jsonify({
            "success": False,
            "message": "Please log in first."
        }), 401
    return update_report_deleted_state(
        report_id, deleted=True, resident_email=email
    )


@app.route("/api/resident/reports/<report_id>/restore", methods=["POST"])
def restore_resident_report(report_id):
    email = session.get("resident_email")
    if not email:
        return jsonify({
            "success": False,
            "message": "Please log in first."
        }), 401
    return update_report_deleted_state(
        report_id, deleted=False, resident_email=email
    )


@app.route(
    "/api/resident/reports/<report_id>/edit", methods=["POST"]
)
def edit_resident_report(report_id):
    email = session.get("resident_email")
    if not email:
        return jsonify({
            "success": False,
            "message": "Please log in first."
        }), 401

    fullname = request.form.get("fullname", "").strip()
    contact_phone = request.form.get("phone", "").strip()
    report_date = request.form.get("date", "").strip()
    report_time = request.form.get("time", "").strip()
    sitio = request.form.get("sitio", "").strip()
    description = request.form.get("description", "").strip()
    priority = request.form.get("priority", "Normal").strip()
    image = request.files.get("garbage-image")

    if not all((fullname, contact_phone, report_date, report_time, sitio)):
        return jsonify({
            "success": False,
            "message": "Please complete all required report fields."
        }), 400

    if (
        len(fullname) > 150
        or len(report_date) > 30
        or len(report_time) > 30
        or len(sitio) > 255
        or len(description) > 2000
    ):
        return jsonify({
            "success": False,
            "message": "One or more report fields exceed the allowed length."
        }), 400

    phone_digits = "".join(
        character for character in contact_phone if character.isdigit()
    )
    if (
        len(contact_phone) > 30
        or len(phone_digits) < 7
        or len(phone_digits) > 15
        or contact_phone.count("+") > 1
        or any(
            not (character.isdigit() or character in "+(). -")
            for character in contact_phone
        )
        or ("+" in contact_phone and not contact_phone.startswith("+"))
    ):
        return jsonify({
            "success": False,
            "message": "Please enter a valid phone number."
        }), 400

    if priority not in ["Normal", "Urgent"]:
        return jsonify({
            "success": False,
            "message": "Please select a valid report priority."
        }), 400

    replacement_filename = None
    if image and image.filename:
        if not allowed_file(image.filename):
            return jsonify({
                "success": False,
                "message": "Invalid image format. Use JPG, JPEG, PNG, GIF, or WEBP."
            }), 400

        original_filename = secure_filename(image.filename)
        if "." not in original_filename:
            return jsonify({
                "success": False,
                "message": "Invalid image filename."
            }), 400

        extension = original_filename.rsplit(".", 1)[1].lower()
        replacement_filename = f"{uuid.uuid4().hex}.{extension}"

    connection = None
    replacement_path = (
        os.path.join(UPLOAD_FOLDER, replacement_filename)
        if replacement_filename else None
    )
    old_image = None
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT image
                FROM reports
                WHERE report_code = %s
                    AND resident_email = %s
                    AND status = 'Pending'
                    AND deleted_at IS NULL
                LIMIT 1
                FOR UPDATE
            """, (report_id, email))
            report = cursor.fetchone()
            if not report:
                connection.rollback()
                return jsonify({
                    "success": False,
                    "message": "Only your active pending reports can be edited."
                }), 404

            if replacement_path:
                save_image(image, replacement_filename)
                old_image = report.get("image")

            update_query = """
                UPDATE reports
                SET fullname = %s, contact_phone = %s, report_date = %s,
                    report_time = %s, sitio = %s, description = %s,
                    priority = %s
            """
            params = [
                fullname, contact_phone, report_date, report_time,
                sitio, description, priority
            ]
            if replacement_filename:
                update_query += ", image = %s"
                params.append(replacement_filename)
            update_query += """
                WHERE report_code = %s AND resident_email = %s
                    AND status = 'Pending' AND deleted_at IS NULL
            """
            params.extend([report_id, email])
            cursor.execute(update_query, tuple(params))

        connection.commit()
    except Exception:
        if connection:
            connection.rollback()
        if replacement_filename:
            delete_stored_image(replacement_filename)
        if replacement_path and os.path.exists(replacement_path):
            try:
                os.remove(replacement_path)
            except OSError:
                app.logger.exception(
                    "Could not remove replacement image for report %s",
                    report_id
                )
        app.logger.exception("Resident report edit error")
        return jsonify({
            "success": False,
            "message": "Could not update your report. Please try again."
        }), 500
    finally:
        if connection:
            connection.close()

    if replacement_filename and old_image:
        delete_stored_image(old_image)
        old_image_path = os.path.abspath(
            os.path.join(UPLOAD_FOLDER, old_image)
        )
        if os.path.dirname(old_image_path) == os.path.abspath(UPLOAD_FOLDER):
            try:
                if os.path.exists(old_image_path):
                    os.remove(old_image_path)
            except OSError:
                app.logger.exception(
                    "Could not remove replaced image for report %s",
                    report_id
                )

    return jsonify({
        "success": True,
        "message": "Report updated successfully."
    })


@app.route(
    "/api/resident/reports/<report_id>/permanent-delete", methods=["POST"]
)
def permanently_delete_resident_report(report_id):
    email = session.get("resident_email")
    if not email:
        return jsonify({
            "success": False,
            "message": "Please log in first."
        }), 401
    return permanently_delete_report(report_id, resident_email=email)


def permanently_delete_report(report_id, resident_email=None):
    connection = None
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            query = """
                SELECT report_code, image, clean_image
                FROM reports
                WHERE report_code = %s AND deleted_at IS NOT NULL
            """
            params = [report_id]
            if resident_email:
                query += " AND resident_email = %s"
                params.append(resident_email)
            query += " LIMIT 1"
            cursor.execute(query, tuple(params))
            report = cursor.fetchone()

            if not report:
                connection.rollback()
                return jsonify({
                    "success": False,
                    "message": "Deleted report not found."
                }), 404

            cursor.execute(
                "DELETE FROM notifications WHERE report_id = %s",
                (report_id,)
            )
            delete_query = (
                "DELETE FROM reports "
                "WHERE report_code = %s AND deleted_at IS NOT NULL"
            )
            delete_params = [report_id]
            if resident_email:
                delete_query += " AND resident_email = %s"
                delete_params.append(resident_email)
            cursor.execute(delete_query, tuple(delete_params))
            if cursor.rowcount != 1:
                connection.rollback()
                return jsonify({
                    "success": False,
                    "message": "Deleted report not found."
                }), 404

        connection.commit()
    except Exception:
        if connection:
            connection.rollback()
        app.logger.exception("Permanent report deletion error")
        return jsonify({
            "success": False,
            "message": "Could not permanently delete the report."
        }), 500
    finally:
        if connection:
            connection.close()

    upload_folder = os.path.abspath(app.config["UPLOAD_FOLDER"])
    images_removed = True
    image_filenames = {
        report.get("image"), report.get("clean_image")
    } - {None, ""}
    for filename in image_filenames:
        delete_stored_image(filename)
        image_path = os.path.abspath(os.path.join(upload_folder, filename))
        if os.path.dirname(image_path) != upload_folder:
            images_removed = False
            app.logger.warning(
                "Skipped deleting report image outside upload folder: %s",
                filename
            )
            continue
        try:
            if os.path.exists(image_path):
                os.remove(image_path)
        except OSError:
            images_removed = False
            app.logger.exception(
                "Could not remove image for permanently deleted report %s",
                report_id
            )

    return jsonify({
        "success": True,
        "message": (
            "Report permanently deleted."
            if images_removed else
            "Report permanently deleted, but one or more photos could not be removed."
        )
    })


def update_report_deleted_state(report_id, deleted, resident_email=None):
    try:
        query = "SELECT report_code FROM reports WHERE report_code = %s"
        params = [report_id]
        if resident_email:
            query += " AND resident_email = %s"
            params.append(resident_email)
        query += " LIMIT 1"
        report = db_fetchone(query, tuple(params))
        if not report:
            return jsonify({
                "success": False,
                "message": "Report not found."
            }), 404

        deleted_at = datetime.now().strftime(DATE_FORMAT) if deleted else None
        db_execute(
            "UPDATE reports SET deleted_at = %s WHERE report_code = %s",
            (deleted_at, report_id)
        )
        return jsonify({
            "success": True,
            "message": "Report moved to Recently Deleted."
            if deleted else "Report restored."
        })
    except Exception:
        app.logger.exception("Report delete/restore error")
        return jsonify({
            "success": False,
            "message": "Could not update the report."
        }), 500


@app.route("/api/resident/notifications")
def resident_notifications_api():
    if "resident_email" not in session:
        return jsonify({
            "success": False,
            "message": "Please log in first."
        }), 401

    try:
        rows = db_fetchall("""
            SELECT n.*
            FROM notifications AS n
            INNER JOIN reports AS r ON r.report_code = n.report_id
            WHERE r.resident_email = %s
                AND n.type NOT IN ('new_report', 'urgent', 'feedback')
            ORDER BY n.created_at DESC
        """, (session["resident_email"],))

        notifications = []
        for row in rows:
            created_at = parse_datetime(row["created_at"])
            notifications.append({
                "id": row["id"],
                "title": row["title"],
                "message": row["message"],
                "type": row["type"],
                "report_id": row.get("report_id"),
                "created_at": created_at.strftime(DATE_FORMAT),
                "is_read": bool(row["is_read"])
            })

        return jsonify({
            "success": True,
            "notifications": notifications,
            "total": len(notifications),
            "unread": sum(
                not notification["is_read"]
                for notification in notifications
            )
        })
    except Exception:
        app.logger.exception("Resident notifications API error")
        return jsonify({
            "success": False,
            "message": "Could not load notifications."
        }), 500


@app.route(
    "/api/resident/notifications/<notification_id>/read",
    methods=["POST"]
)
def mark_resident_notification_read(notification_id):
    if "resident_email" not in session:
        return jsonify({
            "success": False,
            "message": "Please log in first."
        }), 401

    try:
        notification = db_fetchone("""
            SELECT n.id
            FROM notifications AS n
            INNER JOIN reports AS r ON r.report_code = n.report_id
            WHERE n.id = %s AND r.resident_email = %s
                AND n.type NOT IN ('new_report', 'urgent', 'feedback')
            LIMIT 1
        """, (notification_id, session["resident_email"]))
        if not notification:
            return jsonify({
                "success": False,
                "message": "Notification not found."
            }), 404

        db_execute("""
            UPDATE notifications SET is_read = 1
            WHERE id = %s AND report_id IN (
                SELECT report_code FROM reports WHERE resident_email = %s
            ) AND type NOT IN ('new_report', 'urgent', 'feedback')
        """, (notification_id, session["resident_email"]))
        return jsonify({"success": True})
    except Exception:
        app.logger.exception("Mark resident notification read error")
        return jsonify({
            "success": False,
            "message": "Could not update notification."
        }), 500


@app.route(
    "/api/resident/notifications/<notification_id>/delete",
    methods=["POST"]
)
def delete_resident_notification(notification_id):
    if "resident_email" not in session:
        return jsonify({
            "success": False,
            "message": "Please log in first."
        }), 401

    try:
        db_execute("""
            DELETE FROM notifications
            WHERE id = %s AND report_id IN (
                SELECT report_code FROM reports WHERE resident_email = %s
            ) AND type NOT IN ('new_report', 'urgent', 'feedback')
        """, (notification_id, session["resident_email"]))
        return jsonify({"success": True})
    except Exception:
        app.logger.exception("Delete resident notification error")
        return jsonify({
            "success": False,
            "message": "Could not delete notification."
        }), 500


@app.route("/api/resident/notifications/read-all", methods=["POST"])
def mark_all_resident_notifications_read():
    if "resident_email" not in session:
        return jsonify({
            "success": False,
            "message": "Please log in first."
        }), 401

    try:
        db_execute("""
            UPDATE notifications SET is_read = 1
            WHERE report_id IN (
                SELECT report_code FROM reports WHERE resident_email = %s
            ) AND type NOT IN ('new_report', 'urgent', 'feedback')
        """, (session["resident_email"],))
        return jsonify({"success": True})
    except Exception:
        app.logger.exception("Mark all resident notifications read error")
        return jsonify({
            "success": False,
            "message": "Could not update notifications."
        }), 500


@app.route("/api/resident/notifications/delete-all", methods=["POST"])
def delete_all_resident_notifications():
    if "resident_email" not in session:
        return jsonify({
            "success": False,
            "message": "Please log in first."
        }), 401

    try:
        db_execute("""
            DELETE FROM notifications
            WHERE report_id IN (
                SELECT report_code FROM reports WHERE resident_email = %s
            ) AND type NOT IN ('new_report', 'urgent', 'feedback')
        """, (session["resident_email"],))
        return jsonify({"success": True})
    except Exception:
        app.logger.exception("Delete all resident notifications error")
        return jsonify({
            "success": False,
            "message": "Could not delete notifications."
        }), 500


# ==================================================
# SUBMIT GARBAGE REPORT
# ==================================================

@app.route("/submit-report", methods=["POST"])
def submit_report():
    if "resident_email" not in session:
        if is_ajax_request():
            return jsonify({
                "success": False,
                "message": "Your session has expired. Please log in again."
            }), 401
        return redirect(url_for("resident_login"))

    fullname = request.form.get("fullname", "").strip()
    contact_phone = request.form.get("phone", "").strip()
    report_date = request.form.get("date", "").strip()
    report_time = request.form.get("time", "").strip()
    sitio = request.form.get("sitio", "").strip()
    description = request.form.get("description", "").strip()
    priority = request.form.get("priority", "Normal").strip()
    image = request.files.get("garbage-image")

    if (
        not fullname
        or not contact_phone
        or not report_date
        or not report_time
        or not sitio
    ):
        return report_error("Please complete all required report fields.")

    phone_digits = "".join(
        character for character in contact_phone if character.isdigit()
    )
    if (
        len(contact_phone) > 30
        or len(phone_digits) < 7
        or len(phone_digits) > 15
        or contact_phone.count("+") > 1
        or any(
            not (character.isdigit() or character in "+(). -")
            for character in contact_phone
        )
        or ("+" in contact_phone and not contact_phone.startswith("+"))
    ):
        return report_error("Please enter a valid phone number.")

    if priority not in ["Normal", "Urgent"]:
        priority = "Normal"

    if not image or not image.filename:
        return report_error("Please upload a picture of the garbage.")

    if not allowed_file(image.filename):
        return report_error(
            "Invalid image format. Use JPG, JPEG, PNG, GIF, or WEBP."
        )

    original_filename = secure_filename(image.filename)

    if "." not in original_filename:
        return report_error("Invalid image filename.")

    extension = original_filename.rsplit(".", 1)[1].lower()
    filename = f"{uuid.uuid4().hex}.{extension}"
    image_path = os.path.join(UPLOAD_FOLDER, filename)

    resident_email = session["resident_email"]
    now = datetime.now()

    try:
        latest = db_fetchone("""
            SELECT created_at
            FROM reports
            WHERE resident_email = %s AND deleted_at IS NULL
            ORDER BY created_at DESC, id DESC
            LIMIT 1
        """, (resident_email,))

        if latest:
            latest_time = parse_datetime(latest["created_at"])
            elapsed = (now - latest_time).total_seconds()

            if elapsed < REPORT_COOLDOWN_SECONDS:
                seconds_left = int(REPORT_COOLDOWN_SECONDS - elapsed)
                minutes_left = (seconds_left + 59) // 60
                return report_error(
                    f"Please wait about {minutes_left} minute(s) "
                    "before submitting another report."
                )

        existing_reports = db_fetchall("""
            SELECT report_code, sitio, description
            FROM reports
            WHERE status <> 'Completed' AND deleted_at IS NULL
        """)

        normalized_sitio = " ".join(sitio.casefold().split())
        normalized_description = " ".join(description.casefold().split())

        if normalized_description:
            for existing in existing_reports:
                old_sitio = " ".join(
                    (existing.get("sitio") or "").casefold().split()
                )
                old_description = " ".join(
                    (existing.get("description") or "").casefold().split()
                )

                if (
                    old_sitio == normalized_sitio
                    and old_description == normalized_description
                ):
                    return report_error(
                        "Possible duplicate report detected "
                        f"(Report ID: {existing['report_code']}). "
                        "Please check the existing report first."
                    )

        save_image(image, filename)

        report_code = (
            f"BR-{now.strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}"
        )
        created_at = now.strftime(DATE_FORMAT)

        db_execute("""
            INSERT INTO reports (
                report_code, resident_email, fullname, contact_phone,
                report_date, report_time, sitio, description, image, clean_image,
                priority, status, created_at, completed_at
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, NULL,
                %s, 'Pending', %s, NULL
            )
        """, (
            report_code, resident_email, fullname, contact_phone, report_date,
            report_time, sitio, description, filename,
            priority, created_at
        ))

        if priority == "Urgent":
            create_notification(
                "Urgent Garbage Report",
                f"{fullname} submitted an URGENT report at {sitio}.",
                "urgent",
                report_code
            )
        else:
            create_notification(
                "New Garbage Report",
                f"{fullname} submitted a new report at {sitio}.",
                "new_report",
                report_code
            )

    except Exception:
        app.logger.exception("Report submission database error")
        delete_stored_image(filename)

        try:
            if os.path.exists(image_path):
                os.remove(image_path)
        except OSError:
            pass

        return report_error(
            "Could not save your report. Please try again.", 500
        )

    new_report = {
        "id": report_code,
        "email": resident_email,
        "fullname": fullname,
        "phone": contact_phone,
        "date": report_date,
        "time": report_time,
        "sitio": sitio,
        "description": description,
        "image": filename,
        "clean_image": None,
        "priority": priority,
        "status": "Pending",
        "created_at": created_at,
        "completed_at": None
    }

    if is_ajax_request():
        return jsonify({
            "success": True,
            "message": "Garbage report submitted successfully!",
            "report": prepare_report(new_report)
        })

    flash("Garbage report submitted successfully!", "report_success")
    return redirect(url_for("resident_home") + "#my-reports")


# ==================================================
# DISPLAY UPLOADED IMAGES
# ==================================================

MISSING_PHOTO_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" '
    'viewBox="0 0 640 420"><rect width="640" height="420" fill="#EEF2EF"/>'
    '<text x="320" y="200" text-anchor="middle" font-family="sans-serif" '
    'font-size="26" fill="#5B6B62">Photo unavailable</text>'
    '<text x="320" y="238" text-anchor="middle" font-family="sans-serif" '
    'font-size="16" fill="#8D9A92">This photo was uploaded before permanent '
    'storage was enabled.</text></svg>'
)


@app.route("/uploads/<filename>")
def uploaded_file(filename):
    safe_name = secure_filename(filename)

    # 1) Permanent copy in the database
    try:
        row = db_fetchone(
            "SELECT mime_type, data FROM public.uploaded_images "
            "WHERE filename = %s",
            (safe_name,)
        )
    except Exception:
        row = None
        app.logger.warning("Could not read stored image %s", safe_name)

    if row:
        response = Response(bytes(row["data"]), mimetype=row["mime_type"])
        response.headers["Cache-Control"] = "public, max-age=86400"
        return response

    # 2) Older photos that still exist on disk
    disk_path = os.path.join(app.config["UPLOAD_FOLDER"], safe_name)
    if os.path.isfile(disk_path):
        return send_from_directory(app.config["UPLOAD_FOLDER"], safe_name)

    # 3) Photo was lost before permanent storage existed
    response = Response(MISSING_PHOTO_SVG, mimetype="image/svg+xml")
    response.headers["Cache-Control"] = "no-store"
    return response


# ==================================================
# LOGOUT
# ==================================================

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


    
# ==================================================
# RESIDENT FORGOT PASSWORD
# ==================================================

@app.route("/forgot-password", methods=["GET", "POST"])
def forgot_password():
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()

        if not email:
            flash("Please enter your registered email.", "error")
            return render_template("forgot_password.html")

        if not os.getenv("BREVO_API_KEY", "").strip() or not os.getenv(
            "MAIL_DEFAULT_SENDER", ""
        ).strip():
            app.logger.error("Password reset email service is not configured")
            flash(
                "Password reset email is not configured yet. Please contact "
                "your barangay administrator.",
                "error"
            )
            return render_template("forgot_password.html"), 503

        try:
            user = db_fetchone(
                "SELECT email FROM users WHERE LOWER(email) = %s",
                (email,)
            )
        except Exception:
            app.logger.exception("Could not look up password reset account")
            flash(
                "We couldn't start password recovery right now. Please try again shortly.",
                "error"
            )
            return render_template("forgot_password.html"), 503

        # Use the same response whether the account exists or not.
        if user:
            otp = str(secrets.randbelow(900000) + 100000)
            otp_hash = generate_password_hash(otp)

            now = datetime.now()
            expires_at = now + timedelta(minutes=5)

            try:
                db_execute(
                    otp_upsert_query("resident_password_reset_otps"),
                    (email, otp_hash, expires_at, now)
                )
            except Exception:
                app.logger.exception("Could not create password reset OTP")
                flash(
                    "We couldn't start password recovery right now. Please try again shortly.",
                    "error"
                )
                return render_template("forgot_password.html"), 503

            try:
                send_password_reset_email(email, otp)
            except Exception:
                app.logger.exception("Could not send password reset OTP")
                try:
                    db_execute(
                        "DELETE FROM resident_password_reset_otps WHERE email = %s",
                        (email,)
                    )
                except Exception:
                    app.logger.exception("Could not remove unsent password reset OTP")
                flash(
                    "We couldn't send your reset code. Please try again later "
                    "or contact your barangay administrator.",
                    "error"
                )
                return render_template("forgot_password.html"), 503

            session["pending_password_reset_email"] = email

        flash(
            "If that email is registered, a password reset code will be sent.",
            "success"
        )
        return redirect(url_for("reset_password_otp"))

    return render_template("forgot_password.html")


@app.route("/reset-password-otp", methods=["GET", "POST"])
def reset_password_otp():
    email = session.get("pending_password_reset_email")

    if not email:
        flash("Please request a password reset code first.")
        return redirect(url_for("forgot_password"))

    if request.method == "POST":
        otp = request.form.get("otp", "").strip()

        if not otp.isdigit() or len(otp) != 6:
            flash("Enter the 6-digit verification code.")
            return render_template("reset_password_otp.html")

        record = db_fetchone("""
            SELECT otp_hash, expires_at, attempts
            FROM resident_password_reset_otps
            WHERE email = %s
        """, (email,))

        if not record:
            flash("The reset code is invalid or expired. Request a new one.")
            session.pop("pending_password_reset_email", None)
            return redirect(url_for("forgot_password"))

        if record["attempts"] >= 5:
            db_execute(
                "DELETE FROM resident_password_reset_otps WHERE email = %s",
                (email,)
            )
            session.pop("pending_password_reset_email", None)
            flash("Too many attempts. Please request a new code.")
            return redirect(url_for("forgot_password"))

        if record["expires_at"] <= datetime.now():
            db_execute(
                "DELETE FROM resident_password_reset_otps WHERE email = %s",
                (email,)
            )
            session.pop("pending_password_reset_email", None)
            flash("The reset code has expired. Please request a new one.")
            return redirect(url_for("forgot_password"))

        if not check_password_hash(record["otp_hash"], otp):
            db_execute("""
                UPDATE resident_password_reset_otps
                SET attempts = attempts + 1
                WHERE email = %s
            """, (email,))
            flash("Incorrect code. Please try again.")
            return render_template("reset_password_otp.html")

        session["password_reset_verified"] = True
        return redirect(url_for("reset_password"))

    return render_template("reset_password_otp.html")


@app.route("/reset-password", methods=["GET", "POST"])
def reset_password():
    email = session.get("pending_password_reset_email")

    if not email or not session.get("password_reset_verified"):
        flash("Please verify your password reset code first.")
        return redirect(url_for("forgot_password"))

    if request.method == "POST":
        password = request.form.get("password", "")
        confirm_password = request.form.get("confirm_password", "")

        if len(password) < 8:
            flash("Your password must contain at least 8 characters.")
            return render_template("reset_password.html")

        if password != confirm_password:
            flash("The passwords do not match.")
            return render_template("reset_password.html")

        user = db_fetchone(
            "SELECT id FROM users WHERE LOWER(email) = %s",
            (email,)
        )

        if not user:
            session.pop("pending_password_reset_email", None)
            session.pop("password_reset_verified", None)
            flash("Account not found. Please try again.")
            return redirect(url_for("forgot_password"))

        password_hash = generate_password_hash(password)

        db_execute(
            "UPDATE users SET password = %s WHERE id = %s",
            (password_hash, user["id"])
        )

        db_execute(
            "DELETE FROM resident_password_reset_otps WHERE email = %s",
            (email,)
        )

        session.pop("pending_password_reset_email", None)
        session.pop("password_reset_verified", None)

        flash("Password reset successful. You can now log in.")
        return redirect(url_for("resident_login"))

    return render_template("reset_password.html")



# ==================================================
# TEST DATABASE
# ==================================================

@app.route("/test-db")
def test_db():
    connection = None

    try:
        connection = get_db_connection()

        with connection.cursor() as cursor:
            cursor.execute("SELECT current_database() AS db_name" if using_postgres()
                           else "SELECT DATABASE() AS db_name")
            result = cursor.fetchone()

        return jsonify({
            "success": True,
            "message": "Connected to database successfully!",
            "backend": "postgresql" if using_postgres() else "mysql",
            "database": result["db_name"]
        })

    except Exception:
        app.logger.exception("Database connection test failed")
        return jsonify({
            "success": False,
            "message": "Database connection failed. Check terminal logs."
        }), 500

    finally:
        if connection:
            connection.close()


# ==================================================
# RUN APP
# ==================================================python app.py

# Create/repair tables on startup (also runs under gunicorn on Render).
try:
    init_db()
    print("DATABASE INITIALIZED...")
except Exception:
    app.logger.exception("Database initialization failed")


if __name__ == "__main__":
    print("APP STARTING...")

    app.run(
        host="127.0.0.1",
        port=int(os.getenv("PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG", "0") == "1"
    )
