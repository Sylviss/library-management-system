from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, timedelta
from database import SessionLocal
import models

# Settings
HOLD_EXPIRY_DAYS = 3

def run_daily_maintenance():
    """
    Checks for 'Fulfilled' reservations that haven't been picked up.
    If older than 3 days -> Expire Reservation & Release Book.
    """
    print(f"⏰ [Scheduler] Running Maintenance Task: {datetime.now()}")
    
    db = SessionLocal()
    try:
        # Calculate cutoff date
        expiry_limit = datetime.utcnow() - timedelta(days=HOLD_EXPIRY_DAYS)
        
        # 1. Find stale reservations
        # We look for reservations that are 'Fulfilled' (Book is waiting) 
        # but the timestamp is too old.
        stale_reservations = db.query(models.Reservation).filter(
            models.Reservation.status == "Fulfilled",
            models.Reservation.reservation_date < expiry_limit
        ).all()
        
        if not stale_reservations:
            print("   -> No stale reservations found.")
            return

        count = 0
        for res in stale_reservations:
            # A. Expire the Reservation
            res.status = "Expired"
            
            # B. Release the Physical Item
            # Find the item associated with this book title that is currently 'Reserved'
            # Note: In a complex system, we'd link Reservation -> Specific Item ID upon fulfillment.
            # Here, we find *any* reserved copy of this book to release.
            stuck_item = db.query(models.BookItem).filter(
                models.BookItem.book_id == res.book_id,
                models.BookItem.status == "Reserved"
            ).first()
            
            if stuck_item:
                stuck_item.status = "Available"
                print(f"   -> Released Item {stuck_item.barcode} (Was reserved for Member {res.member_id})")
            
            count += 1
        
        db.commit()
        print(f"✅ [Scheduler] Maintenance Complete. Expired {count} reservations.")
        
    except Exception as e:
        print(f"❌ [Scheduler] Error during maintenance: {e}")
        db.rollback()
    finally:
        db.close()

# Initialize Scheduler
scheduler = BackgroundScheduler()

# Schedule the job
# Option A: Run every night at Midnight (Production Style)
# scheduler.add_job(run_daily_maintenance, 'cron', hour=0, minute=0)

# Option B: Run every 60 seconds (For Demo/Testing Purposes)
# We will use this so you can see it working immediately in the logs.
scheduler.add_job(run_daily_maintenance, 'interval', seconds=60)