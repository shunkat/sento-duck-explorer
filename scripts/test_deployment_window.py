import unittest
from datetime import datetime, timedelta, timezone

from deployment_window import deployment_allowed


class DeploymentWindowTests(unittest.TestCase):
    def test_before_cutoff_can_publish(self):
        self.assertTrue(deployment_allowed(datetime.fromisoformat("2026-12-04T21:44:59+00:00")))

    def test_at_cutoff_cannot_start_publication(self):
        self.assertFalse(deployment_allowed(datetime.fromisoformat("2026-12-04T21:45:00+00:00")))

    def test_deadline_and_later_reruns_stay_frozen(self):
        for instant in ("2026-12-04T22:00:00+00:00", "2027-01-01T00:00:00+00:00"):
            with self.subTest(instant=instant):
                self.assertFalse(deployment_allowed(datetime.fromisoformat(instant)))

    def test_japan_time_uses_the_same_cutoff(self):
        jst = timezone(timedelta(hours=9))
        self.assertFalse(deployment_allowed(datetime(2026, 12, 5, 6, 45, tzinfo=jst)))

    def test_time_without_timezone_is_rejected(self):
        with self.assertRaises(ValueError):
            deployment_allowed(datetime(2026, 12, 4, 21))
