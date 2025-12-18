from database import SessionLocal, engine, Base
import models
from passlib.context import CryptContext
from datetime import date, timedelta
from sqlalchemy import text  # <--- MAKE SURE THIS IS HERE

# Setup Password Hasher
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def reset_db():
    print("⚠️  Resetting database...")
    
    # 1. Force-Kill all other connections
    try:
        with engine.connect() as connection:
            connection.execution_options(isolation_level="AUTOCOMMIT")
            connection.execute(text("""
                SELECT pg_terminate_backend(pg_stat_activity.pid)
                FROM pg_stat_activity
                WHERE pg_stat_activity.datname = 'library_db'
                  AND pid <> pg_backend_pid();
            """))
    except Exception as e:
        print(f"   (Note: Could not kill connections: {e})")

    # 2. Drop Tables
    Base.metadata.drop_all(bind=engine)
    
    # 3. Re-create Tables
    Base.metadata.create_all(bind=engine)
    print("✅ Database reset complete.")

def seed_db():
    db = SessionLocal()
    try:
        print("🌱 Seeding data...")
        
        # --- 1. Create Users ---
        # Password for all is "123"
        pw_hash = pwd_context.hash("123")
        
        admin = models.Librarian(email="admin@library.com", hashed_password=pw_hash, full_name="Super Admin", role="Admin")
        
        alice = models.Member(email="alice@test.com", hashed_password=pw_hash, full_name="Alice Engineer")
        bob = models.Member(email="bob@test.com", hashed_password=pw_hash, full_name="Bob Manager")
        charlie = models.Member(email="charlie@test.com", hashed_password=pw_hash, full_name="Charlie Newbie")
        
        db.add_all([admin, alice, bob, charlie])
        db.commit() # Commit to generate IDs

        # --- 2. Create Books ---
        b1 = models.Book(title="Python for Beginners", author="Guido", isbn="111", genre="Tech")
        b2 = models.Book(title="Advanced Data Science", author="Andrew Ng", isbn="222", genre="Tech")
        b3 = models.Book(title="The Great Gatsby", author="F. Scott", isbn="333", genre="Fiction")
        b4 = models.Book(title="Project Management 101", author="Steve Jobs", isbn="444", genre="Business")
        
        db.add_all([b1, b2, b3, b4])
        db.commit()

        # --- 3. Create Physical Items ---
        # We add 2 copies of Python, 1 of others
        i1_a = models.BookItem(barcode="ITEM-PY-01", book_id=b1.id, status="Available")
        i1_b = models.BookItem(barcode="ITEM-PY-02", book_id=b1.id, status="Available")
        i2_a = models.BookItem(barcode="ITEM-DS-01", book_id=b2.id, status="Available")
        i3_a = models.BookItem(barcode="ITEM-GAT-01", book_id=b3.id, status="Available")
        
        db.add_all([i1_a, i1_b, i2_a, i3_a])
        db.commit()

        # --- 4. Create Loan History (The "Smart" Part) ---
        # Scenario: Alice likes Tech. She read "Python" and "Data Science".
        
        # Alice borrowed Python (Returned)
        l1 = models.Loan(book_item_id=i1_a.barcode, member_id=alice.id, issue_date=date.today()-timedelta(days=10), due_date=date.today(), return_date=date.today(), status="Returned")
        # Alice borrowed Data Science (Returned)
        l2 = models.Loan(book_item_id=i2_a.barcode, member_id=alice.id, issue_date=date.today()-timedelta(days=5), due_date=date.today(), return_date=date.today(), status="Returned")
        
        db.add_all([l1, l2])
        db.commit()

        # --- 5. Create Views (Recent Interest) ---
        # Scenario: Charlie is new. He hasn't borrowed anything.
        # But he just CLICKED on "Python for Beginners".
        
        v1 = models.BookView(member_id=charlie.id, book_id=b1.id)
        db.add(v1)
        db.commit()

        print("✅ Seeding complete!")
        print("------------------------------------------------")
        print("User Login: alice@test.com / 123")
        print("Admin Login: admin@library.com / 123")
        print("Recommendation Test: Check recommendations for Charlie (Member ID 3).")
        print("   -> Charlie viewed 'Python'. Alice read 'Python' AND 'Data Science'.")
        print("   -> Result should be: 'Advanced Data Science'.")
        print("------------------------------------------------")

    except Exception as e:
        print(f"❌ Error seeding data: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    reset_db()
    seed_db()