from database import SessionLocal, engine, Base
import models
from passlib.context import CryptContext
from datetime import date, timedelta, datetime
from sqlalchemy import text
import random
import requests
import time
# Setup Password Hasher
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SEARCH_QUERIES = [
    "isbn:9780132350884", # Clean Code
    "isbn:9780201616224", # Pragmatic Programmer
    "isbn:9780135957059", # Refactoring (Fowler)
    "isbn:9780134494166", # Design Patterns (GoF)
    "intitle:The Great Gatsby",
    "intitle:1984 George Orwell",
    "intitle:The Hobbit J.R.R. Tolkien",
    "intitle:Dune Frank Herbert",
    "intitle:The Fellowship of the Ring",
    "intitle:The Two Towers",
    "intitle:The Return of the King",
    "intitle:Harry Potter and the Sorcerer's Stone",
    "intitle:Harry Potter and the Chamber of Secrets",
    "intitle:Harry Potter and the Prisoner of Azkaban",
    "intitle:Brave New World Aldous Huxley",
    "intitle:Fahrenheit 451 Ray Bradbury",
    "intitle:The Catcher in the Rye",
    "intitle:Thinking Fast and Slow",
    "intitle:Sapiens Yuval Noah Harari",
    "intitle:Atomic Habits James Clear"
]

def fetch_book_from_google(query):
    """Helper to fetch data from Google Books API"""
    try:
        url = f"https://www.googleapis.com/books/v1/volumes?q={query}"
        res = requests.get(url, timeout=5)
        data = res.json()
        if "items" not in data: return None
        
        info = data["items"][0]["volumeInfo"]
        return {
            "title": info.get("title"),
            "author": ", ".join(info.get("authors", ["Unknown"])),
            "isbn": next((id['identifier'] for id in info.get("industryIdentifiers", []) if id['type'] == 'ISBN_13'), str(random.randint(1000000000000, 9999999999999))),
            "publisher": info.get("publisher"),
            "publication_year": info.get("publishedDate", "")[:4] if info.get("publishedDate") else "2020",
            "description": info.get("description", "No description available."),
            "cover_image_url": info.get("imageLinks", {}).get("thumbnail"),
            "genre": info.get("categories", ["General"])[0]
        }
    except Exception as e:
        print(f"   [Error] Could not fetch {query}: {e}")
        return None


def reset_db():
    print("⚠️  Resetting database...")
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

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("✅ Database reset complete.")

def seed_db():
    db = SessionLocal()
    try:
        print("🌱 Seeding rich data...")
        
        # =====================================================
        # 1. USERS
        # =====================================================
        pw = pwd_context.hash("123")
        
        # Staff
        admin = models.Librarian(email="admin@library.com", hashed_password=pw, full_name="Super Admin", role="Admin")
        lib = models.Librarian(email="lib@library.com", hashed_password=pw, full_name="Librarian Linda", role="Librarian")
        
        # Members
        alice = models.Member(email="alice@test.com", hashed_password=pw, full_name="Alice Active")
        bob = models.Member(email="bob@test.com", hashed_password=pw, full_name="Bob The Debtor")
        charlie = models.Member(email="charlie@test.com", hashed_password=pw, full_name="Charlie Queue")
        david = models.Member(email="david@test.com", hashed_password=pw, full_name="David Late")
        eve = models.Member(email="eve@test.com", hashed_password=pw, full_name="Eve Reader")
        frank = models.Member(email="frank@test.com", hashed_password=pw, full_name="Frank Newbie")

        db.add_all([admin, lib, alice, bob, charlie, david, eve, frank])
        db.commit()

        # =====================================================
        # 2. BOOKS & ITEMS
        # =====================================================
        books_data = [
            # Tech
            {"title": "Python Crash Course", "author": "Eric Matthes", "genre": "Tech", "items": 2},
            {"title": "Clean Code", "author": "Robert C. Martin", "genre": "Tech", "items": 1},
            {"title": "Introduction to Algorithms", "author": "Thomas H. Cormen", "genre": "Tech", "items": 1},
            # Fiction
            {"title": "The Great Gatsby", "author": "F. Scott Fitzgerald", "genre": "Fiction", "items": 2},
            {"title": "1984", "author": "George Orwell", "genre": "Fiction", "items": 1}, # High demand
            {"title": "The Hobbit", "author": "J.R.R. Tolkien", "genre": "Fantasy", "items": 1},
            {"title": "Harry Potter", "author": "JK Rowling", "genre": "Fantasy", "items": 2},
            # Sci-Fi
            {"title": "Dune", "author": "Frank Herbert", "genre": "Sci-Fi", "items": 1},
            {"title": "Neuromancer", "author": "William Gibson", "genre": "Sci-Fi", "items": 0}, # Out of stock completely
        ]

        created_books = {} # Map Title -> DB Object
        created_items = {} # Map Title -> List of Barcodes

        for b_data in books_data:
            book = models.Book(
                title=b_data["title"], 
                author=b_data["author"], 
                genre=b_data["genre"],
                isbn=f"978-{random.randint(100000, 999999)}"
            )
            db.add(book)
            db.commit()
            created_books[book.title] = book
            
            created_items[book.title] = []
            for i in range(b_data["items"]):
                barcode = f"ITEM-{book.id}-{i+1}"
                item = models.BookItem(barcode=barcode, book_id=book.id, status="Available")
                db.add(item)
                created_items[book.title].append(item)
            db.commit()
            
        books_created = []
        for query in SEARCH_QUERIES:
            print(f"   -> Fetching: {query}")
            book_data = fetch_book_from_google(query)
            if book_data:
                # Check for existing title to avoid duplicates
                existing = db.query(models.Book).filter(models.Book.title == book_data['title']).first()
                if not existing:
                    book = models.Book(**book_data)
                    db.add(book)
                    db.commit()
                    books_created.append(book)
                    
                    # Create 1-3 items for each book
                    for i in range(random.randint(1, 3)):
                        barcode = f"BCG-{book.id}-{i+1}"
                        item = models.BookItem(barcode=barcode, book_id=book.id, status="Available")
                        db.add(item)
                    db.commit()
            time.sleep(0.2) # Minor delay for API rate limits

        print(f"✅ Created {len(books_created)} unique book titles.")

        # =====================================================
        # 3. LOAN HISTORY (For ML Recommendations)
        # =====================================================
        # Logic: Alice and Eve have similar taste (Fantasy).
        # Eve read "Harry Potter" + "Hobbit". Alice read "Harry Potter".
        # ML should recommend "Hobbit" to Alice.
        
        # Eve's History
        h1 = models.Loan(book_item_id=created_items["Harry Potter"][0].barcode, member_id=eve.id, status="Returned", due_date=date.today(), return_date=date.today())
        h2 = models.Loan(book_item_id=created_items["The Hobbit"][0].barcode, member_id=eve.id, status="Returned", due_date=date.today(), return_date=date.today())
        
        # Alice's History
        h3 = models.Loan(book_item_id=created_items["Harry Potter"][1].barcode, member_id=alice.id, status="Returned", due_date=date.today(), return_date=date.today())

        db.add_all([h1, h2, h3])
        
        # Log Views for Frank (He viewed Python, so suggest Clean Code)
        v1 = models.BookView(member_id=frank.id, book_id=created_books["Python Crash Course"].id)
        # Alice viewed Dune
        v2 = models.BookView(member_id=alice.id, book_id=created_books["Dune"].id)
        
        db.add_all([v1, v2])
        db.commit()

        # =====================================================
        # 4. ACTIVE LOANS & OVERDUE (Dynamic Fines Test)
        # =====================================================
        
        # Bob has a VERY overdue book
        bad_loan = models.Loan(
            book_item_id=created_items["Clean Code"][0].barcode,
            member_id=bob.id,
            status="Active",
            issue_date=date.today() - timedelta(days=45),
            due_date=date.today() - timedelta(days=30) 
        )
        created_items["Clean Code"][0].status = "Borrowed"
        
        # --- NEW: Manually insert the fine that the scheduler WOULD have created ---
        # 30 days overdue * $1 = $30
        bob_fine = models.Fine(
            loan_id=None, # We don't have the ID yet until commit, see fix below
            member_id=bob.id,
            amount=30.0,
            reason="Overdue",
            status="Unpaid"
        )
        
        # Add loan first to get ID
        db.add(bad_loan)
        db.commit()
        
        # Now link fine to loan
        bob_fine.loan_id = bad_loan.id
        db.add(bob_fine)
        db.commit()

        # David has a currently active loan (Not overdue)
        good_loan = models.Loan(
            book_item_id=created_items["Dune"][0].barcode,
            member_id=david.id,
            status="Active",
            issue_date=date.today(),
            due_date=date.today() + timedelta(days=14)
        )
        created_items["Dune"][0].status = "Borrowed"

        db.add_all([bad_loan, good_loan])
        db.commit()

        # =====================================================
        # 5. RESERVATIONS (Queue Test)
        # =====================================================
        
        # "1984" is borrowed by Alice (let's say she grabbed the only copy just now)
        loan_1984 = models.Loan(
            book_item_id=created_items["1984"][0].barcode, 
            member_id=alice.id, 
            status="Active",
            due_date=date.today() + timedelta(days=14)
        )
        created_items["1984"][0].status = "Borrowed"
        db.add(loan_1984)
        db.commit()

        # Charlie wants "1984" (Position #1)
        res1 = models.Reservation(
            book_id=created_books["1984"].id,
            member_id=charlie.id,
            status="Pending",
            reservation_date=datetime.now() - timedelta(hours=5)
        )
        # David wants "1984" (Position #2)
        res2 = models.Reservation(
            book_id=created_books["1984"].id,
            member_id=david.id,
            status="Pending",
            reservation_date=datetime.now() - timedelta(hours=1)
        )
        
        # Eve had a reservation for "Python Crash Course" and it is READY (Fulfilled)
        # Note: We need to mark an item as "Reserved" for this to be valid logic
        res3 = models.Reservation(
            book_id=created_books["Python Crash Course"].id,
            member_id=eve.id,
            status="Fulfilled",
            reservation_date=datetime.now() - timedelta(days=1)
        )
        created_items["Python Crash Course"][0].status = "Reserved" # Item 1 reserved for Eve
        
        # Notification for Eve
        notif = models.Notification(
            member_id=eve.id, 
            message=f"Good news! The book 'Python Crash Course' is now available for pickup."
        )

        db.add_all([res1, res2, res3, notif])
        db.commit()

        # =====================================================
        # 6. FINES (Recorded Debt)
        # =====================================================
        
        # Charlie returned a book late previously. He has a $5 unpaid fine.
        # Loan ID doesn't strictly matter for the fine balance check, but good for foreign key.
        past_loan = models.Loan(book_item_id=created_items["The Great Gatsby"][0].barcode, member_id=charlie.id, status="Returned", due_date=date.today(), return_date=date.today())
        db.add(past_loan)
        db.commit()
        
        fine = models.Fine(
            loan_id=past_loan.id,
            member_id=charlie.id,
            amount=5.0,
            status="Unpaid",
            reason="Overdue 5 days"
        )
        db.add(fine)
        db.commit()

        print("✅ Seeding complete!")
        print("------------------------------------------------")
        print("Admin: admin@library.com / 123")
        print("Librarian: lib@library.com / 123")
        print("------------------------------------------------")
        print("User: alice@test.com  -> Good history, borrowing '1984'")
        print("User: bob@test.com    -> BLOCKED! (30 days overdue book)")
        print("User: charlie@test.com-> Waiting List #1 for '1984', Owes $5")
        print("User: david@test.com  -> Waiting List #2 for '1984'")
        print("User: eve@test.com    -> Pickup Ready: 'Python Crash Course'")
        print("------------------------------------------------")

    except Exception as e:
        print(f"❌ Error seeding data: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    reset_db()
    seed_db()