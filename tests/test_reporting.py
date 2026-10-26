"""Integration checks against a dedicated, disposable MySQL database.

Run with BASU_TEST_DATABASE=basureport_test python -m unittest discover -s tests -v.
The configured MySQL user must have access to that database; no production DB is used.
"""
import io
import os
import unittest
from pathlib import Path
import tempfile

TEST_DATABASE = os.getenv('BASU_TEST_DATABASE', '')
if TEST_DATABASE and not TEST_DATABASE.endswith('_test'):
    raise RuntimeError('BASU_TEST_DATABASE must end with _test')
if TEST_DATABASE:
    os.environ['MYSQLDATABASE'] = TEST_DATABASE

@unittest.skipUnless(TEST_DATABASE, 'Set BASU_TEST_DATABASE to a disposable database ending in _test')
class ReportingFlow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import app as module
        cls.module = module
        cls.app = module.app
        cls.app.config.update(TESTING=True)
        cls.uploads = tempfile.TemporaryDirectory()
        cls.original_uploads = module.UPLOAD_FOLDER
        module.UPLOAD_FOLDER = cls.uploads.name
        cls.app.config['UPLOAD_FOLDER'] = cls.uploads.name
        module.init_db()
        cls.resident = cls.app.test_client()
        cls.admin = cls.app.test_client()
        cls.other = cls.app.test_client()
        for client, values in [(cls.resident, {'resident_email':'resident@example.test', 'resident_name':'Test Resident', 'feedback_token':'test-token'}), (cls.admin, {'is_admin': True}), (cls.other, {'resident_email':'other@example.test', 'feedback_token':'test-token'})]:
            with client.session_transaction() as session:
                session.update(values)

    @classmethod
    def tearDownClass(cls):
        cls.module.UPLOAD_FOLDER = cls.original_uploads
        cls.app.config['UPLOAD_FOLDER'] = cls.original_uploads
        cls.uploads.cleanup()

    def setUp(self):
        self.module.db_execute('DELETE FROM notifications')
        self.module.db_execute('DELETE FROM reports')
        self.module.db_execute('''INSERT INTO reports
            (report_code,resident_email,fullname,report_date,report_time,sitio,description,image,status,created_at)
            VALUES ('TEST-OLD','resident@example.test','Test Resident','2026-01-01','12:00','Purok 1','Waste','before.png','Pending','2026-01-01 12:00:00')''')
        Path(self.uploads.name, 'before.png').write_bytes(b'before image fixture')

    def feedback(self, client=None, **values):
        data = {'rating': '4', 'feedback': 'Thank you <script>alert(1)</script>', 'feedback_token': 'test-token', **values}
        return (client or self.resident).post('/api/resident/reports/TEST-OLD/feedback', data=data)

    def complete_fixture(self):
        self.module.db_execute("UPDATE reports SET status='Completed', clean_image='after.png', completed_at=NOW()")

    def test_workflow_and_both_photo_views(self):
        headers = {'X-Requested-With':'XMLHttpRequest'}
        self.assertEqual(self.admin.post('/complete-report/TEST-OLD', headers=headers).status_code, 400)
        response = self.admin.post('/api/admin/reports/TEST-OLD/decision', data={'decision':'accept'})
        self.assertTrue(response.json['success'])
        self.assertTrue(self.admin.post('/start-cleaning/TEST-OLD', headers=headers).json['success'])
        self.assertEqual(self.admin.post('/complete-report/TEST-OLD', headers=headers).status_code, 400)
        response = self.admin.post('/complete-report/TEST-OLD', headers=headers, data={'clean-image':(io.BytesIO(b'photo fixture'), 'after.png')})
        self.assertTrue(response.json['success'])
        report = self.module.get_report_by_id('TEST-OLD')
        for client, route in [(self.resident, '/resident/report/TEST-OLD'), (self.admin, '/admin/report/TEST-OLD')]:
            html = client.get(route).text
            self.assertIn('/uploads/before.png', html)
            self.assertIn('/uploads/'+report['clean_image'], html)
            self.assertIn('Before cleaning', html)
            self.assertIn('After cleaning', html)
        self.assertEqual(self.feedback().status_code, 200)
        self.assertEqual(self.module.get_report_by_id('TEST-OLD')['rating'], 4)
        self.assertIn('&lt;script&gt;', self.admin.get('/admin/feedback').text)
        self.assertIn('TEST-OLD', self.admin.get('/admin/transactions').text)
        self.assertEqual(len([n for n in self.admin.get('/api/admin/notifications').json['notifications'] if n['type']=='feedback']), 1)
        self.assertFalse(any(n['type']=='feedback' for n in self.resident.get('/api/resident/notifications').json['notifications']))

    def test_feedback_requires_completed_owned_report(self):
        self.assertEqual(self.feedback().status_code, 409)
        self.complete_fixture()
        self.assertEqual(self.feedback(self.other).status_code, 404)
        self.assertEqual(self.other.get('/resident/report/TEST-OLD').status_code, 404)
        self.assertEqual(self.feedback(self.app.test_client()).status_code, 401)

    def test_feedback_validation_csrf_and_duplicate(self):
        self.complete_fixture()
        self.assertEqual(self.feedback(feedback_token='wrong').status_code, 403)
        for rating in ['0', '6', '1.5', '', '-1']:
            self.assertEqual(self.feedback(rating=rating).status_code, 400)
        self.assertEqual(self.feedback(feedback='x'*501).status_code, 400)
        self.assertEqual(self.feedback().status_code, 200)
        self.assertEqual(self.feedback(rating='1').status_code, 409)
        self.assertEqual(self.module.get_report_by_id('TEST-OLD')['rating'], 4)

    def test_deleted_reports_cannot_receive_feedback(self):
        self.complete_fixture()
        self.module.db_execute('UPDATE reports SET deleted_at=NOW()')
        self.assertEqual(self.feedback().status_code, 404)

    def test_reports_and_notifications_newest_first(self):
        self.module.db_execute('''INSERT INTO reports
            (report_code,resident_email,fullname,report_date,report_time,sitio,image,status,created_at)
            VALUES ('TEST-NEW','resident@example.test','Test Resident','2026-02-01','12:00','Purok 2','before.png','Pending','2026-02-01 12:00:00')''')
        reports = self.resident.get('/api/resident/reports').json['reports']
        self.assertEqual([r['id'] for r in reports], ['TEST-NEW', 'TEST-OLD'])
        for code, date in [('TEST-NEW', '2026-02-01'), ('TEST-OLD', '2026-01-01')]:
            self.module.db_execute("INSERT INTO notifications (id,title,message,type,report_id,created_at) VALUES (%s,'Update','Test','completed',%s,%s)",(code,code,date+' 12:00:00'))
        for client, route in [(self.admin, '/api/admin/notifications'), (self.resident, '/api/resident/notifications')]:
            self.assertEqual([n['id'] for n in client.get(route).json['notifications']], ['TEST-NEW','TEST-OLD'])

    def test_submission_and_migration_idempotence(self):
        self.module.init_db()
        self.module.init_db()
        response = self.resident.post('/submit-report', headers={'X-Requested-With':'XMLHttpRequest'}, data={
            'fullname':'Test Resident','phone':'09123456789','date':'2026-10-26','time':'12:30','sitio':'Purok 3','description':'Litter by the bridge',
            'garbage-image':(io.BytesIO(b'photo fixture'),'before.png')})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json['success'])
        report = self.resident.get('/api/resident/reports').json['reports'][0]
        self.assertEqual(report['status'], 'Pending')
        self.assertEqual(report['phone'], '09123456789')
        self.assertIsNone(report['rating'])
        with self.resident.get('/uploads/'+report['image']) as response:
            self.assertEqual(response.status_code, 200)

    def test_admin_pages_require_auth_and_render(self):
        for path in ['/admin/transactions','/admin/expected-benefits','/admin/feedback','/admin-dashboard','/admin/report/TEST-OLD']:
            self.assertEqual(self.app.test_client().get(path).status_code, 302)
            self.assertEqual(self.admin.get(path).status_code, 200)
        self.assertIn('After photo will appear', self.resident.get('/resident/report/TEST-OLD').text)
