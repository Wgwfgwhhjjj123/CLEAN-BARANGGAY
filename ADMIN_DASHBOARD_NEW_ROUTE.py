# Add to your app.py (adjust names to match your models). Your old admin_dashboard.html stays untouched.
# Preview URL:  http://127.0.0.1:5000/admin/dashboard-new
from sqlalchemy import func

@app.route("/admin/dashboard-new")
def admin_dashboard_new():
    # TODO: use YOUR admin login check here (same one your current dashboard uses)
    q = Report.query
    stats = {
        "total": q.count(),
        "pending": q.filter_by(status="pending").count(),
        "in_progress": q.filter_by(status="in_progress").count(),
        "cleaned": q.filter_by(status="cleaned").count(),
        "avg_rating": db.session.query(func.avg(Report.rating)).scalar(),
    }
    reports = q.order_by(Report.id.desc()).limit(20).all()
    report_dates = sorted({r.created_at.strftime("%Y-%m-%d") for r in Report.query.all() if r.created_at})
    return render_template("admin_dashboard_new.html",
                           stats=stats, reports=reports, report_dates=report_dates,
                           admin_name="Admin")   # replace with the logged-in admin's name
# If you leave out stats/reports, the page shows sample data so you can preview the design.
