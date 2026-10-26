# Add these to app.py (above the `if __name__ == "__main__":` line).
# Uses the same helper your app already has: get_db_connection().
# IMPORTANT: replace the TODO lines with the SAME admin-login check your other admin routes use.
#
# If your cursor returns tuples instead of dicts, change the SELECT part to use
#   pymysql.cursors.DictCursor  (import pymysql.cursors) so the template can read a.title, a.message ...

from flask import request, redirect, url_for, flash, abort, render_template

def load_announcements(limit=20):
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT id, title, message, pinned, created_at
                FROM announcements
                WHERE deleted_at IS NULL
                ORDER BY pinned DESC, created_at DESC
                LIMIT %s
            """, (limit,))
            return cursor.fetchall()
    finally:
        connection.close()


@app.route("/admin/announcements", methods=["POST"])
def create_announcement():
    # TODO: admin check here (abort(403) if not logged in as admin)
    title = request.form.get("title", "").strip()[:120]
    message = request.form.get("message", "").strip()[:500]
    pinned = 1 if request.form.get("pinned") else 0
    if not title or not message:
        flash("Title and message are required.", "error")
        return redirect("/admin-dashboard-new")
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO announcements (title, message, pinned, created_by) VALUES (%s, %s, %s, %s)",
                (title, message, pinned, "admin"),   # TODO: use the logged-in admin's name/email
            )
        connection.commit()
    finally:
        connection.close()
    flash("Announcement posted.", "success")
    return redirect("/admin-dashboard-new")


@app.route("/admin/announcements/<int:announcement_id>/delete", methods=["POST"])
def delete_announcement(announcement_id):
    # TODO: admin check here
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("UPDATE announcements SET deleted_at = NOW() WHERE id = %s", (announcement_id,))
        connection.commit()
    finally:
        connection.close()
    return redirect("/admin-dashboard-new")


# In your dashboard route, pass the list to the template:
#     return render_template("admin_dashboard_new.html", ..., announcements=load_announcements())
#
# Residents: show the same list on resident_home.html by calling load_announcements(5)
# and looping over it (no Delete button, no "New" button).
