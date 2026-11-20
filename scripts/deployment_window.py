"""Keep the submitted Pages site fixed at the recorded Kiroween deadline."""

from datetime import datetime, timedelta, timezone


SUBMISSION_DEADLINE = datetime(2026, 12, 4, 22, tzinfo=timezone.utc)
# Leave 15 minutes for the deploy action's 10-minute timeout and cancellation.
DEPLOYMENT_CUTOFF = SUBMISSION_DEADLINE - timedelta(minutes=15)


def deployment_allowed(now: datetime) -> bool:
    if now.tzinfo is None:
        raise ValueError("Deployment time must include a timezone")
    return now < DEPLOYMENT_CUTOFF


if __name__ == "__main__":
    allowed = deployment_allowed(datetime.now(timezone.utc))
    print(f"allowed={str(allowed).lower()}")
