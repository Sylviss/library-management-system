from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, timedelta, date
from database import SessionLocal
import models

# Settings
HOLD_EXPIRY_DAYS = 3
DAILY_FINE_AMOUNT = 1.0

def run_daily_maintenance():
    print(f"⏰ [Scheduler] Running Maintenance Task: {datetime.now()}")
    db = SessionLocal()
    try:
        # ==========================================
        # TASK 1: Expire Stale Reservations
        # ==========================================
        expiry_limit = datetime.utcnow() - timedelta(days=HOLD_EXPIRY_DAYS)
        stale_reservations = db.query(models.Reservation).filter(
            models.Reservation.status == "Fulfilled",
            models.Reservation.reservation_date < expiry_limit
        ).all()
        
        for res in stale_reservations:
            res.status = "Expired"
            stuck_item = db.query(models.BookItem).filter(
                models.BookItem.book_id == res.book_id,
                models.BookItem.status == "Reserved"
            ).first()
            if stuck_item:
                stuck_item.status = "Available"
        
        # ==========================================
        # TASK 2: Calculate Daily Fines (FIXED)
        # ==========================================
        today = date.today()
        
        # Find all Active loans that are Overdue
        overdue_loans = db.query(models.Loan).filter(
            models.Loan.status == "Active",
            models.Loan.due_date < today
        ).all()

        fine_updates = 0
        for loan in overdue_loans:
            # 1. Calculate how much the fine SHOULD be right now
            overdue_days = (today - loan.due_date).days
            expected_amount = overdue_days * DAILY_FINE_AMOUNT

            # 2. Find existing fine record
            fine = db.query(models.Fine).filter(
                models.Fine.loan_id == loan.id,
                models.Fine.reason == "Overdue"
            ).first()

            if fine:
                # OPTIMIZATION: Only update if the amount changed (i.e., a new day passed)
                if fine.amount != expected_amount:
                    fine.amount = expected_amount
                    # If they paid it off previously, re-open the debt
                    if fine.status == "Paid":
                        fine.status = "Partial"
                    fine_updates += 1
            else:
                # Create new fine record
                fine = models.Fine(
                    loan_id=loan.id,
                    member_id=loan.member_id,
                    amount=expected_amount,
                    reason="Overdue",
                    status="Unpaid"
                )
                db.add(fine)
                fine_updates += 1

        db.commit()
        print(f"✅ [Scheduler] Maintenance Complete. Expired reservations: {len(stale_reservations)}. Updated fines: {fine_updates}.")
        
    except Exception as e:
        print(f"❌ [Scheduler] Error: {e}")
        db.rollback()
    finally:
        db.close()

# Initialize Scheduler
scheduler = BackgroundScheduler()
# Run every 60 seconds for demonstration purposes
scheduler.add_job(run_daily_maintenance, 'interval', seconds=60)