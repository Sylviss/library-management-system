from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks # <--- 1. Add BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
import requests
import os
from typing import Union


from contextlib import asynccontextmanager # Add this
from scheduler import scheduler            # Add this
# Import our local modules
from database import engine, Base, get_db
import models
import schemas
from passlib.context import CryptContext
from datetime import timedelta, date, datetime
import recommendation

from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
    
from fastapi.security import OAuth2PasswordRequestForm

LOAN_PERIOD_DAYS = 14
MAX_RENEWALS = 2
DAILY_FINE_AMOUNT = 1.0    

MAX_LOANS_PER_MEMBER = 5
MAX_FINE_THRESHOLD = 10.0 # If user owes > $10, block borrowing
HOLD_EXPIRY_DAYS = 3      # Reservations expire after 3 days

# Create Tables
Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    print("🚀 System Starting... Initializing Scheduler...")
    scheduler.start()
    yield
    # --- Shutdown ---
    print("🛑 System Shutting Down... Stopping Scheduler...")
    scheduler.shutdown()

app = FastAPI(lifespan=lifespan)
# CORS (Allowed for development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
    
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Configuration
SECRET_KEY = "supersecretkey" # In production, use os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
  
# --- Auth Helpers ---

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """
    Decodes the token, extracts user ID/Role, and verifies they exist.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        role: str = payload.get("role")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Check DB based on role
    if role == "Librarian" or role == "Admin":
        user = db.query(models.Librarian).filter(models.Librarian.email == email).first()
    else:
        user = db.query(models.Member).filter(models.Member.email == email).first()
        
    if user is None:
        raise credentials_exception
        
    return user
  
# --- Google Books Helper Function ---
def fetch_google_book(query: str):
    """Searches Google Books API and returns the first result formatted as a dict"""
    api_url = f"https://www.googleapis.com/books/v1/volumes?q={query}"
    response = requests.get(api_url)
    data = response.json()

    if "items" not in data:
        return None

    # Get first result
    info = data["items"][0]["volumeInfo"]
    
    return {
        "title": info.get("title"),
        "author": ", ".join(info.get("authors", ["Unknown"])),
        "isbn": next((id['identifier'] for id in info.get("industryIdentifiers", []) if id['type'] == 'ISBN_13'), None),
        "publisher": info.get("publisher"),
        "publication_year": info.get("publishedDate", "")[:4] if info.get("publishedDate") else None,
        "description": info.get("description"),
        "cover_image_url": info.get("imageLinks", {}).get("thumbnail"),
        "genre": info.get("categories", ["General"])[0]
    }


# --- API Routes ---

@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "Library System is running"}

@app.get("/api/books", response_model=list[schemas.BookResponse])
def get_books(
    search: str = "", 
    author: str = "", 
    genre: str = "",
    db: Session = Depends(get_db)
):
    """BIM-006: Advanced Search"""
    query = db.query(models.Book)
    
    if search:
        query = query.filter(models.Book.title.ilike(f"%{search}%"))
    if author:
        query = query.filter(models.Book.author.ilike(f"%{author}%"))
    if genre:
        query = query.filter(models.Book.genre.ilike(f"%{genre}%"))
        
    books = query.all()
    
    # Calculate available copies
    for book in books:
        book.available_copies = len([item for item in book.items if item.status == 'Available'])
    
    return books

# 2. Add Book (Manual)
@app.post("/api/books", response_model=schemas.BookResponse)
def create_book(book: schemas.BookCreate, db: Session = Depends(get_db)):
    # Check if ISBN exists to avoid duplicates
    if book.isbn:
        existing = db.query(models.Book).filter(models.Book.isbn == book.isbn).first()
        if existing:
            raise HTTPException(status_code=400, detail="Book with this ISBN already exists")
            
    db_book = models.Book(**book.dict())
    db.add(db_book)
    db.commit()
    db.refresh(db_book)
    return db_book

# 3. Import Book from Google (The "Magic" Button)
@app.post("/api/books/import", response_model=schemas.BookResponse)
def import_book(request: schemas.GoogleImportRequest, db: Session = Depends(get_db)):
    # 1. Fetch from Google
    book_data = fetch_google_book(request.query)
    if not book_data:
        raise HTTPException(status_code=404, detail="Book not found on Google Books")

    # 2. Check if already exists (by ISBN)
    if book_data.get("isbn"):
        existing = db.query(models.Book).filter(models.Book.isbn == book_data["isbn"]).first()
        if existing:
            return existing # Return existing if found

    # 3. Save to DB
    db_book = models.Book(**book_data)
    db.add(db_book)
    db.commit()
    db.refresh(db_book)
    return db_book

# 4. Add Physical Copy (Item)
@app.post("/api/books/{book_id}/items", response_model=schemas.BookItemResponse)
def add_book_item(book_id: int, item: schemas.BookItemCreate, db: Session = Depends(get_db)):
    # Check if book exists
    book = db.query(models.Book).filter(models.Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book ID not found")
        
    # Check if barcode already exists
    if db.query(models.BookItem).filter(models.BookItem.barcode == item.barcode).first():
        raise HTTPException(status_code=400, detail="Barcode already exists")

    db_item = models.BookItem(**item.dict(), book_id=book_id)
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


# --- Member Management Endpoints ---

@app.post("/api/members", response_model=schemas.MemberResponse)
def register_member(member: schemas.MemberCreate, db: Session = Depends(get_db)):
    # 1. Check if email exists
    if db.query(models.Member).filter(models.Member.email == member.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # 2. Hash Password
    hashed_pw = pwd_context.hash(member.password)
    
    # 3. Create Member
    db_member = models.Member(
        email=member.email,
        hashed_password=hashed_pw,
        full_name=member.full_name,
        phone_number=member.phone_number,
        address=member.address
    )
    db.add(db_member)
    db.commit()
    db.refresh(db_member)
    return db_member

@app.get("/api/members/search", response_model=list[schemas.MemberResponse])
def search_members(
    q: str, 
    current_user: models.Librarian = Depends(get_current_user), # RBAC: Librarians only
    db: Session = Depends(get_db)
):
    """MEM-005: Search Members by Name, Email, or Phone"""
    # ilike is case-insensitive
    members = db.query(models.Member).filter(
        (models.Member.full_name.ilike(f"%{q}%")) |
        (models.Member.email.ilike(f"%{q}%")) |
        (models.Member.phone_number.ilike(f"%{q}%"))
    ).all()
    return members

@app.get("/api/members/{member_id}", response_model=schemas.MemberResponse)
def get_member(member_id: int, db: Session = Depends(get_db)):
    member = db.query(models.Member).filter(models.Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    return member

# --- Circulation Endpoints (The Core Logic) ---

@app.post("/api/loans/issue", response_model=schemas.LoanResponse)
def issue_book(request: schemas.LoanIssueRequest, db: Session = Depends(get_db)):
    # 1. Validate Member
    member = db.query(models.Member).filter(models.Member.id == request.member_id).first()
    if not member or member.status != "Active":
        raise HTTPException(status_code=400, detail="Member not found or not active")

    # 2. Check Loan Limits
    active_loans = db.query(models.Loan).filter(
        models.Loan.member_id == member.id,
        models.Loan.status == "Active"
    ).all()
    
    if len(active_loans) >= MAX_LOANS_PER_MEMBER:
        raise HTTPException(status_code=400, detail=f"Member has reached maximum loan limit ({MAX_LOANS_PER_MEMBER})")

    # --- NEW: Check Outstanding Fines (Simplified) ---
    # We trust the 'fines' table because the Scheduler updates it daily
    unpaid_fines = db.query(models.Fine).filter(
        models.Fine.member_id == member.id,
        models.Fine.status.in_(["Unpaid", "Partial"])
    ).all()
    
    total_debt = sum(f.amount - f.amount_paid for f in unpaid_fines)
    
    if total_debt >= MAX_FINE_THRESHOLD:
        raise HTTPException(
            status_code=400, 
            detail=f"Blocked: Outstanding fines of ${total_debt}. Limit is ${MAX_FINE_THRESHOLD}."
        )

    # 3. Validate Book Item
    item = db.query(models.BookItem).filter(models.BookItem.barcode == request.book_item_barcode).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Book item not found")

    # SPECIAL CHECK: If item is Reserved, only the Reserver can borrow it
    if item.status == "Reserved":
        # Find the active reservation for this book title
        reservation = db.query(models.Reservation).filter(
            models.Reservation.book_id == item.book_id,
            models.Reservation.member_id == request.member_id,
            models.Reservation.status == "Fulfilled"
        ).first()
        
        if not reservation:
            raise HTTPException(status_code=400, detail="Item is Reserved for another member.")
        
        # If match, Close the reservation
        reservation.status = "Completed"
    
    elif item.status != "Available":
        raise HTTPException(status_code=400, detail=f"Item is currently {item.status}")

    # 4. Create Loan
    due_date = date.today() + timedelta(days=request.days)
    new_loan = models.Loan(
        book_item_id=item.barcode,
        member_id=member.id,
        due_date=due_date,
        status="Active"
    )
    item.status = "Borrowed"
    db.add(new_loan)
    db.commit()
    db.refresh(new_loan)
    return new_loan

# --- Reservation Endpoints ---

@app.post("/api/reservations", response_model=schemas.ReservationResponse)
def reserve_book(request: schemas.ReservationCreate, db: Session = Depends(get_db)):
    # 1. Check Book
    book = db.query(models.Book).filter(models.Book.id == request.book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    # --- NEW: Check Outstanding Fines (Block Deadbeats) ---
    unpaid_fines = db.query(models.Fine).filter(
        models.Fine.member_id == request.member_id,
        models.Fine.status.in_(["Unpaid", "Partial"])
    ).all()
    
    total_debt = sum(f.amount - f.amount_paid for f in unpaid_fines)
    
    if total_debt >= MAX_FINE_THRESHOLD:
        raise HTTPException(
            status_code=400, 
            detail=f"Reservation blocked: You have outstanding fines of ${total_debt}. Limit is ${MAX_FINE_THRESHOLD}."
        )
    # ------------------------------------------------------
    already_borrowed = db.query(models.Loan).join(models.BookItem).filter(
        models.Loan.member_id == request.member_id,
        models.BookItem.book_id == request.book_id,
        models.Loan.status == "Active"
    ).first()

    if already_borrowed:
        raise HTTPException(
            status_code=400, 
            detail="You currently have a copy of this book. Return it before reserving again."
        )
    # 2. Check Duplicate Reservation
    existing_res = db.query(models.Reservation).filter(
        models.Reservation.book_id == request.book_id,
        models.Reservation.member_id == request.member_id,
        models.Reservation.status.in_(["Pending", "Fulfilled"])
    ).first()
    
    if existing_res:
        raise HTTPException(status_code=400, detail="You already have an active reservation for this book.")

    # 3. Check Availability (No Camping)
    available_count = db.query(models.BookItem).filter(
        models.BookItem.book_id == request.book_id,
        models.BookItem.status == "Available"
    ).count()

    if available_count > 0:
        raise HTTPException(status_code=400, detail="Book is currently available. You can borrow it directly.")

    # 4. Create Reservation
    reservation = models.Reservation(
        book_id=request.book_id,
        member_id=request.member_id,
        status="Pending"
    )
    db.add(reservation)
    db.commit()
    db.refresh(reservation)
    return reservation

@app.post("/api/reservations/{reservation_id}/cancel")
def cancel_reservation(reservation_id: int, db: Session = Depends(get_db)):
    # 1. Find the reservation to be canceled
    reservation = db.query(models.Reservation).filter(models.Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    
    # 2. Check if this reservation was already "Fulfilled" (Book is waiting on shelf)
    if reservation.status == "Fulfilled":
        # A. Find the physical copy that was held for this book title
        stuck_item = db.query(models.BookItem).filter(
            models.BookItem.book_id == reservation.book_id,
            models.BookItem.status == "Reserved"
        ).first()

        if stuck_item:
            # B. Look for the NEXT person in line (The person with the oldest 'Pending' reservation)
            next_in_line = db.query(models.Reservation).filter(
                models.Reservation.book_id == reservation.book_id,
                models.Reservation.status == "Pending"
            ).order_by(models.Reservation.reservation_date.asc()).first()

            if next_in_line:
                # --- HANDOVER LOGIC ---
                # 1. Keep the item status as "Reserved"
                # 2. Move the next person to "Fulfilled"
                next_in_line.status = "Fulfilled"
                
                # 3. Notify the new lucky person
                msg = f"Good news! The book '{stuck_item.book.title}' is now available for pickup because someone ahead of you canceled."
                notification = models.Notification(member_id=next_in_line.member_id, message=msg)
                db.add(notification)
                
                print(f"♻️ Handover: Hold for {reservation.member_id} canceled. Book assigned to next in line: Member {next_in_line.member_id}")
            else:
                # No one else is waiting -> Make it available for the public
                stuck_item.status = "Available"
                print(f"♻️ Released: No one else in line for {stuck_item.barcode}. Setting to Available.")

    # 3. Finalize cancellation of the current user
    reservation.status = "Canceled"
    db.commit()
    
    return {"message": "Reservation canceled. Queue updated and item reassigned if necessary."}


# --- Fine Management Endpoints ---
# NEW:
@app.get("/api/my/fines", response_model=list[schemas.FineResponse])
def get_my_fines(
    current_user: models.Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """PORT-002: View Fines (Source of Truth: Database)"""
    return db.query(models.Fine).filter(
        models.Fine.member_id == current_user.id,
        models.Fine.status.in_(["Unpaid", "Partial"])
    ).all()

@app.post("/api/fines/{fine_id}/pay")
def pay_fine(
    fine_id: int, 
    payment: schemas.FinePaymentRequest, 
    current_user: models.Librarian = Depends(get_current_user), # RBAC: Only staff can collect money
    db: Session = Depends(get_db)
):
    """
    CIRC-004: Collect Fines (Staff Only)
    BUSINESS RULE: 
    1. Only Librarians/Admins can process payments.
    2. A fine cannot be paid if the associated book is still 'Active' (not returned).
    3. Supports partial payments.
    """
    # 1. Staff Check
    if current_user.role not in ["Librarian", "Admin"]:
        raise HTTPException(status_code=403, detail="Only staff members can process fine payments.")

    # 2. Find Fine
    fine = db.query(models.Fine).filter(models.Fine.id == fine_id).first()
    if not fine:
        raise HTTPException(status_code=404, detail="Fine record not found")
    
    # 3. ENFORCE RULE: Book must be returned first
    # This prevents users from paying today to "bypass" the debt block while still keeping the book.
    if fine.loan.status == "Active":
        raise HTTPException(
            status_code=400, 
            detail=f"Payment Blocked: Book item {fine.loan.book_item_id} is still out. " 
                   f"The book must be returned to the library before this fine can be settled."
        )

    # 4. Check if already paid
    remaining_balance = fine.amount - fine.amount_paid
    if fine.status == "Paid" or remaining_balance <= 0:
        raise HTTPException(status_code=400, detail="This fine is already fully paid.")

    # 5. Validate Amount
    if payment.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero.")
        
    if payment.amount > remaining_balance:
        raise HTTPException(status_code=400, detail=f"Payment exceeds the remaining balance of ${remaining_balance:.2f}")

    # 6. Process Payment
    fine.amount_paid += payment.amount
    
    # 7. Update Status
    if fine.amount_paid >= fine.amount:
        fine.status = "Paid"
    else:
        fine.status = "Partial"

    db.commit()
    return {
        "message": "Payment recorded successfully",
        "paid_now": payment.amount,
        "remaining_balance": fine.amount - fine.amount_paid,
        "new_status": fine.status
    }

@app.get("/api/recommendations", response_model=list[schemas.BookResponse])
def get_recommendations(member_id: int, db: Session = Depends(get_db)):
    """
    PORT-005: View Recommendations
    Uses ML to find books based on borrowing history.
    """
    # 1. Run the ML Engine
    try:
        book_ids = recommendation.recommend_books(db, member_id)
    except Exception as e:
        print(f"ML Error: {e}")
        book_ids = []

    if not book_ids:
        return []

    # 2. Fetch Book Objects from DB
    books = db.query(models.Book).filter(models.Book.id.in_(book_ids)).all()

    # --- FIX: Calculate Available Copies ---
    for book in books:
        book.available_copies = len([item for item in book.items if item.status == 'Available'])
    # ---------------------------------------

    return books


def cleanup_old_views(db: Session):
    """
    Deletes BookView records older than 24 hours.
    This runs in the background to avoid slowing down the API.
    """
    cutoff_time = datetime.utcnow() - timedelta(days=1)
    
    # SQL: DELETE FROM book_views WHERE view_date < cutoff_time
    deleted_count = db.query(models.BookView).filter(
        models.BookView.view_date < cutoff_time
    ).delete(synchronize_session=False)
    
    db.commit()
    if deleted_count > 0:
        print(f"Cleaned up {deleted_count} old book views.")
        

@app.post("/api/books/{book_id}/view")
def log_book_view(
    book_id: int, 
    member_id: int, 
    background_tasks: BackgroundTasks, # <--- Inject BackgroundTasks
    db: Session = Depends(get_db)
):
    """
    Log view & Trigger Cleanup.
    """
    # 1. Verify book exists
    book = db.query(models.Book).filter(models.Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    # 2. Record New View
    view = models.BookView(member_id=member_id, book_id=book_id)
    db.add(view)
    db.commit()
    
    # 3. Schedule Cleanup (Runs after response is sent)
    background_tasks.add_task(cleanup_old_views, db)

    return {"message": "View logged"}

@app.post("/api/auth/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # 1. Check Librarian Table first
    # Note: OAuth2 form sends 'username', we treat it as email
    librarian = db.query(models.Librarian).filter(models.Librarian.email == form_data.username).first()
    if librarian and pwd_context.verify(form_data.password, librarian.hashed_password):
        token = create_access_token(data={"sub": librarian.email, "role": librarian.role, "id": librarian.id})
        return {"access_token": token, "token_type": "bearer", "role": librarian.role, "user_id": librarian.id}

    # 2. Check Member Table
    member = db.query(models.Member).filter(models.Member.email == form_data.username).first()
    if member and pwd_context.verify(form_data.password, member.hashed_password):
        token = create_access_token(data={"sub": member.email, "role": "Member", "id": member.id})
        return {"access_token": token, "token_type": "bearer", "role": "Member", "user_id": member.id}
        
    raise HTTPException(status_code=400, detail="Incorrect email or password")

@app.get("/api/my/loans", response_model=schemas.LoanHistoryResponse)
def get_my_loan_history(
    current_user: models.Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """PORT-001: View Borrowed Books & Loan History"""
    active = db.query(models.Loan).filter(
        models.Loan.member_id == current_user.id,
        models.Loan.status == "Active"
    ).all()
    
    past = db.query(models.Loan).filter(
        models.Loan.member_id == current_user.id,
        models.Loan.status == "Returned"
    ).all()
    
    return {"active_loans": active, "past_loans": past}

@app.put("/api/my/profile")
def update_my_profile(
    profile_data: schemas.ProfileUpdate,
    current_user: Union[models.Member, models.Librarian] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Works for BOTH Librarians and Members"""
    # 1. Update common fields
    if profile_data.full_name:
        current_user.full_name = profile_data.full_name
        
    # 2. Update Member-only fields
    if hasattr(current_user, 'phone_number'): # Only members have these
        if profile_data.phone_number:
            current_user.phone_number = profile_data.phone_number
        if profile_data.address:
            current_user.address = profile_data.address
            
    db.commit()
    db.refresh(current_user)
    return {"message": "Profile updated", "full_name": current_user.full_name}

@app.post("/api/my/password")
def change_my_password(
    pass_data: schemas.PasswordChange,
    # Allow both user types
    current_user: Union[models.Member, models.Librarian] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """PORT-004: Change Password (Works for Members AND Librarians)"""
    # 1. Verify Old Password
    if not pwd_context.verify(pass_data.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect current password")
    
    # 2. Update to New Password
    current_user.hashed_password = pwd_context.hash(pass_data.new_password)
    db.commit()
    
    return {"message": "Password updated successfully"}

@app.post("/api/loans/{loan_id}/renew")
def renew_book(
    loan_id: int,
    current_user: models.Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """PORT-006: Renew Book Loan"""
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    
    # 1. Basic Validation (Not Found, Auth, Inactive)
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
        
    # Permission Check (Owner or Staff)
    is_owner = loan.member_id == current_user.id
    is_staff = getattr(current_user, "role", None) in ["Librarian", "Admin"]
    if not (is_owner or is_staff):
        raise HTTPException(status_code=403, detail="Not authorized")

    if loan.status != "Active":
        raise HTTPException(status_code=400, detail="Cannot renew inactive loan")

    # If a Member is trying to renew, check if they are Blocked
    if not hasattr(current_user, 'role'): # It's a Member
        if current_user.status != "Active":
            raise HTTPException(status_code=400, detail="Your account is blocked. Please contact the library.")
    
    # --- NEW: Check if Overdue ---
    if loan.due_date < date.today():
        raise HTTPException(
            status_code=400, 
            detail="Cannot renew overdue items. Please return the book."
        )
    # -----------------------------

    # 2. Check Renewal Limit
    if loan.renewal_count >= MAX_RENEWALS:
        raise HTTPException(status_code=400, detail="Maximum renewal limit reached.")

    # 3. Check Reservations (No Camping)
    book_id = loan.book_item.book_id
    pending_reservations = db.query(models.Reservation).filter(
        models.Reservation.book_id == book_id,
        models.Reservation.status == "Pending"
    ).count()

    if pending_reservations > 0:
        raise HTTPException(status_code=400, detail="Cannot renew: Reserved by another member.")

    # 4. Success
    loan.due_date = loan.due_date + timedelta(days=LOAN_PERIOD_DAYS)
    loan.renewal_count += 1
    db.commit()
    
    return {"message": "Loan renewed successfully", "new_due_date": loan.due_date, "renewal_count": loan.renewal_count}

@app.get("/api/my/profile", response_model=schemas.MemberResponse)
def get_my_profile(current_user: models.Member = Depends(get_current_user)):
    """Get current logged-in member details"""
    # Calculate fines dynamically for the response
    unpaid = [f for f in current_user.fines if f.status != "Paid"]
    current_user.total_fines_due = sum(f.amount - f.amount_paid for f in unpaid)
    return current_user

@app.post("/api/loans/return", response_model=schemas.LoanResponse)
def return_book(request: schemas.LoanReturnRequest, db: Session = Depends(get_db)):
    # 1. Find Active Loan
    loan = db.query(models.Loan).filter(
        models.Loan.book_item_id == request.book_item_barcode,
        models.Loan.status == "Active"
    ).first()

    if not loan:
        raise HTTPException(status_code=404, detail="No active loan found for this barcode")

    # 2. Update Loan (Close it)
    loan.return_date = date.today()
    loan.status = "Returned"

    # 3. Update Item Status (Handle Damage)
    item = db.query(models.BookItem).filter(models.BookItem.barcode == request.book_item_barcode).first()
    
    if request.condition == "Damaged":
        item.status = "Damaged"
        # --- NEW: Add Damage Fine ---
        damage_fine = models.Fine(
            loan_id=loan.id,
            member_id=loan.member_id,
            amount=50.0, # Flat fee or look up book price
            reason="Book Returned Damaged",
            status="Unpaid"
        )
        db.add(damage_fine)
    else:
        # ... (Reservation Fulfillment Logic - Keep existing) ...
        # Copy the "next_reservation" block from previous implementation here
        next_reservation = db.query(models.Reservation).filter(
            models.Reservation.book_id == item.book_id,
            models.Reservation.status == "Pending"
        ).order_by(models.Reservation.reservation_date.asc()).first()

        if next_reservation:
            item.status = "Reserved"
            next_reservation.status = "Fulfilled"
            # Add Notification here if you want
        else:
            item.status = "Available"

    # 4. REMOVED: The block that calculated overdue fines. 
    # The Scheduler handled that for us!

    db.commit()
    db.refresh(loan)
    return loan

@app.get("/api/reports/overdue", response_model=list[schemas.OverdueReportItem])
def get_overdue_report(
    current_user: models.Librarian = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """ADMIN-001: Generate Report (Overdue Items)"""
    today = date.today()
    overdue_loans = db.query(models.Loan).filter(
        models.Loan.status == "Active",
        models.Loan.due_date < today
    ).all()
    
    report = []
    for loan in overdue_loans:
        # Get book title via BookItem -> Book
        title = loan.book_item.book.title if loan.book_item and loan.book_item.book else "Unknown"
        days_over = (today - loan.due_date).days
        
        report.append({
            "loan_id": loan.id,
            "book_title": title,
            "member_email": loan.member.email,
            "due_date": loan.due_date,
            "days_overdue": days_over
        })
    return report

@app.post("/api/librarians", response_model=schemas.LibrarianResponse)
def create_librarian(
    librarian: schemas.LibrarianCreate, 
    current_user: models.Librarian = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """ADMIN-003: Create new Librarian Account (Admin Only)"""
    # Strict RBAC Check
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Only Admins can create librarian accounts")
        
    if db.query(models.Librarian).filter(models.Librarian.email == librarian.email).first():
        raise HTTPException(status_code=400, detail="Email already exists")
        
    hashed_pw = pwd_context.hash(librarian.password)
    new_lib = models.Librarian(
        email=librarian.email,
        hashed_password=hashed_pw,
        full_name=librarian.full_name,
        role=librarian.role
    )
    db.add(new_lib)
    db.commit()
    db.refresh(new_lib)
    return new_lib

# --- Admin / Maintenance Endpoints ---

@app.patch("/api/members/{member_id}/status", response_model=schemas.MemberResponse)
def update_member_status(
    member_id: int, 
    status_data: schemas.MemberStatusUpdate, 
    current_user: models.Librarian = Depends(get_current_user), # RBAC: Only Librarians
    db: Session = Depends(get_db)
):
    """MEM-003: Deactivate / Reactivate member account"""
    if current_user.role not in ["Librarian", "Admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    member = db.query(models.Member).filter(models.Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    member.status = status_data.status
    db.commit()
    db.refresh(member)
    return member

@app.put("/api/books/{book_id}", response_model=schemas.BookResponse)
def update_book(
    book_id: int, 
    book_data: schemas.BookUpdate, 
    current_user: models.Librarian = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """BIM-004: Update Book Information"""
    book = db.query(models.Book).filter(models.Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    
    # Update fields if provided
    for key, value in book_data.dict(exclude_unset=True).items():
        setattr(book, key, value)
    
    db.commit()
    db.refresh(book)
    return book

@app.delete("/api/items/{barcode}")
def delete_book_item(
    barcode: str, 
    current_user: models.Librarian = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    item = db.query(models.BookItem).filter(models.BookItem.barcode == barcode).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # CRITICAL CHECK: Block if the book is physically with a member
    if item.status in ["Borrowed", "Reserved"]:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot remove item. It is currently {item.status}. Return the item first."
        )
        
    db.delete(item)
    db.commit()
    return {"message": "Physical item removed"}

@app.get("/api/reports/stats", response_model=schemas.DashboardStats)
def get_dashboard_stats(
    current_user: models.Librarian = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """ADMIN-001: Generate Reports (Dashboard Stats)"""
    
    total_members = db.query(models.Member).count()
    total_titles = db.query(models.Book).count()
    total_items = db.query(models.BookItem).count()
    
    active_loans = db.query(models.Loan).filter(models.Loan.status == "Active").count()
    
    pending_reservations = db.query(models.Reservation).filter(models.Reservation.status == "Pending").count()
    
    # Sum of unpaid fines
    total_fines = db.query(func.sum(models.Fine.amount)).filter(models.Fine.status == "Unpaid").scalar() or 0.0
    
    return {
        "total_members": total_members,
        "total_titles": total_titles,
        "total_items": total_items,
        "active_loans": active_loans,
        "pending_reservations": pending_reservations,
        "total_fines_unpaid": total_fines
    }

@app.get("/api/items/{barcode}/history", response_model=list[schemas.LoanResponse])
def get_item_loan_history(
    barcode: str,
    current_user: models.Librarian = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """CIRC-005: View loan history of book item"""
    loans = db.query(models.Loan).filter(
        models.Loan.book_item_id == barcode
    ).order_by(models.Loan.issue_date.desc()).all()
    
    if not loans:
        # Check if item exists at least
        item = db.query(models.BookItem).filter(models.BookItem.barcode == barcode).first()
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
            
    return loans

@app.post("/api/loans/{loan_id}/lost")
def mark_book_lost(
    loan_id: int, 
    request: schemas.MarkLostRequest, 
    current_user: models.Librarian = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """BIM-005 / CIRC: Handle Lost Book"""
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan or loan.status != "Active":
        raise HTTPException(status_code=400, detail="Active loan not found")

    # 1. Update Loan
    loan.status = "Lost"
    loan.return_date = date.today() # Closed today

    # 2. Update Item
    item = loan.book_item
    item.status = "Lost"

    # 3. Create Fine (Replacement Fee)
    fine = models.Fine(
        loan_id=loan.id,
        member_id=loan.member_id,
        amount=request.replacement_fee,
        reason="Replacement fee for lost book",
        status="Unpaid"
    )
    db.add(fine)
    db.commit()
    return {"message": "Book marked as lost and fine created"}

@app.get("/api/my/notifications", response_model=list[schemas.NotificationResponse])
def get_my_notifications(
    current_user: models.Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(models.Notification).filter(
        models.Notification.member_id == current_user.id
    ).order_by(models.Notification.created_at.desc()).all()

@app.post("/api/maintenance/expire_holds")
def expire_stale_reservations(
    current_user: models.Librarian = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Clean up reservations that have been waiting too long (3 days).
    Logic: Mark Reservation 'Expired' -> Make Book 'Available'.
    """
    expiry_date = datetime.utcnow() - timedelta(days=HOLD_EXPIRY_DAYS)
    
    # Find fulfilled reservations that have expired
    stale_reservations = db.query(models.Reservation).filter(
        models.Reservation.status == "Fulfilled",
        models.Reservation.reservation_date < expiry_date 
        # Note: In a real prod DB, we would have a 'fulfillment_date' column. 
        # Using 'reservation_date' acts as a proxy for this academic scope.
    ).all()
    
    count = 0
    for res in stale_reservations:
        res.status = "Expired"
        
        # Find a book item of this title that is currently stuck in "Reserved" status
        # and free it up.
        stuck_item = db.query(models.BookItem).filter(
            models.BookItem.book_id == res.book_id,
            models.BookItem.status == "Reserved"
        ).first()
        
        if stuck_item:
            stuck_item.status = "Available"
            print(f"♻️  Expired hold for {res.member_id}. {stuck_item.barcode} is now Available.")
        
        count += 1
        
    db.commit()
    return {"message": f"Expired {count} stale reservations and released books."}

@app.get("/api/reports/active_loans", response_model=list[schemas.ActiveLoanReportItem])
def get_active_loans_report(
    current_user: models.Librarian = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    loans = db.query(models.Loan).filter(models.Loan.status == "Active").all()
    report = []
    for loan in loans:
        report.append({
            "loan_id": loan.id,
            "book_title": loan.book_item.book.title,
            "member_email": loan.member.email,
            "issue_date": loan.issue_date,
            "due_date": loan.due_date
        })
    return report

@app.get("/api/reports/member_activity", response_model=list[schemas.MemberActivityReportItem])
def get_member_activity_report(
    current_user: models.Librarian = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    members = db.query(models.Member).all()
    report = []
    for m in members:
        paid_fines = sum(f.amount_paid for f in m.fines)
        active_loans = len([l for l in m.loans if l.status == "Active"])
        total_loans = len(m.loans)
        
        report.append({
            "member_id": m.id,
            "full_name": m.full_name,
            "email": m.email,
            "total_loans": total_loans,
            "active_loans_count": active_loans,
            "total_fines_paid": paid_fines
        })
    return report

@app.get("/api/my/reservations", response_model=list[schemas.ReservationResponse])
def get_my_reservations(
    current_user: models.Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    PORT-001/002: View My active reservations.
    Includes Book Titles and Queue Positions.
    """
    # 1. Fetch active reservations for the current member
    reservations = db.query(models.Reservation).filter(
        models.Reservation.member_id == current_user.id,
        models.Reservation.status.in_(["Pending", "Fulfilled"])
    ).all()
    
    output = []
    
    for res in reservations:
        # Convert DB object to Pydantic model
        item = schemas.ReservationResponse.from_orm(res)
        
        # QoL Fix: Inject the Book Title so the user knows what they reserved
        item.book_title = res.book.title 

        # Logic: Calculate Queue Position for "Pending" items
        if res.status == "Pending":
            # Count how many other 'Pending' reservations for this book 
            # were created BEFORE this one (strictly older timestamp)
            earlier_reservations_count = db.query(models.Reservation).filter(
                models.Reservation.book_id == res.book_id,
                models.Reservation.status == "Pending",
                models.Reservation.reservation_date < res.reservation_date
            ).count()
            
            # Position 0 in query means you are 1st in line
            item.queue_position = earlier_reservations_count + 1
        else:
            # If status is 'Fulfilled', they are at the front of the line (Pickup ready)
            item.queue_position = 0 

        output.append(item)
        
    return output

@app.get("/api/admin/librarians", response_model=list[schemas.LibrarianResponse])
def list_librarians(
    current_user: models.Librarian = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """ADMIN-003: List all staff (Admin Only)"""
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return db.query(models.Librarian).all()

@app.get("/api/members/{member_id}/loans", response_model=schemas.LoanHistoryResponse)
def get_member_loans(
    member_id: int,
    current_user: models.Librarian = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Staff view of a member's loans"""
    if current_user.role not in ["Librarian", "Admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    active = db.query(models.Loan).filter(models.Loan.member_id == member_id, models.Loan.status == "Active").all()
    past = db.query(models.Loan).filter(models.Loan.member_id == member_id, models.Loan.status == "Returned").all()
    return {"active_loans": active, "past_loans": past}

@app.get("/api/members/{member_id}/reservations", response_model=list[schemas.ReservationResponse])
def get_member_reservations(
    member_id: int,
    current_user: models.Librarian = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Staff view of a member's reservations"""
    if current_user.role not in ["Librarian", "Admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    return db.query(models.Reservation).filter(
        models.Reservation.member_id == member_id,
        models.Reservation.status.in_(["Pending", "Fulfilled"])
    ).all()

# We already have get_member_fines logic, but let's ensure it's exposed for staff
# You might need to check if you deleted `get_member_fines` earlier. 
# If it's missing, add this:
@app.get("/api/members/{member_id}/fines_details", response_model=list[schemas.FineResponse])
def get_member_fines_staff(
    member_id: int,
    current_user: models.Librarian = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in ["Librarian", "Admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    return db.query(models.Fine).filter(
        models.Fine.member_id == member_id
    ).all()

@app.get("/api/books/{book_id}", response_model=schemas.BookResponse)
def get_book_details(book_id: int, db: Session = Depends(get_db)):
    """Get detailed info for a single book"""
    book = db.query(models.Book).filter(models.Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    
    # Compute available copies on the fly
    book.available_copies = len([item for item in book.items if item.status == 'Available'])
    return book

@app.get("/api/books/{book_id}/items", response_model=list[schemas.BookItemResponse])
def get_book_items_list(
    book_id: int, 
    current_user: models.Librarian = Depends(get_current_user), # Staff only
    db: Session = Depends(get_db)
):
    """List all physical copies of a specific book"""
    # Verify book exists
    book = db.query(models.Book).filter(models.Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
        
    return db.query(models.BookItem).filter(models.BookItem.book_id == book_id).all()

@app.get("/api/items/{barcode}/details", response_model=schemas.BookItemDetail)
def get_item_details(
    barcode: str,
    current_user: models.Librarian = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    item = db.query(models.BookItem).filter(models.BookItem.barcode == barcode).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item barcode not found")
    
    response = {
        "barcode": item.barcode,
        "status": item.status,
        "book_title": item.book.title,
        "book_author": item.book.author,
        "book_cover": item.book.cover_image_url,
        "reserved_for": [],
        "current_borrower_id": None,
        "current_borrower_name": None,
        "due_date": None
    }
    
    # Logic 1: If Reserved, who is waiting?
    if item.status == "Reserved":
        candidates = db.query(models.Reservation).filter(
            models.Reservation.book_id == item.book_id,
            models.Reservation.status == "Fulfilled"
        ).all()
        response["reserved_for"] = [f"{res.member.full_name} (ID: {res.member_id})" for res in candidates]

    # Logic 2: If Borrowed, who has it? (Auto-fill support)
    if item.status == "Borrowed" or item.status == "Overdue": # "Overdue" isn't a status in DB (it's calc), but checking Borrowed covers it
        active_loan = db.query(models.Loan).filter(
            models.Loan.book_item_id == item.barcode,
            models.Loan.status == "Active"
        ).first()
        
        if active_loan:
            response["current_borrower_id"] = active_loan.member_id
            response["current_borrower_name"] = active_loan.member.full_name
            response["due_date"] = active_loan.due_date

    return response
    
@app.get("/api/admin/reservations/search", response_model=list[schemas.ReservationResponse])
def search_all_reservations(
    q: str = "",
    current_user: models.Librarian = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in ["Librarian", "Admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    query = db.query(models.Reservation).join(models.Member).join(models.Book)
    
    if q:
        search = f"%{q}%"
        query = query.filter(
            (models.Member.full_name.ilike(search)) |
            (models.Book.title.ilike(search))
        )
    
    results = query.order_by(models.Reservation.status.desc(), models.Reservation.reservation_date.desc()).all()
    
    output = []
    for r in results:
        item = schemas.ReservationResponse.from_orm(r)
        item.member_name = r.member.full_name
        item.book_title = r.book.title
        
        # --- NEW: Calculate Position for Staff View ---
        if r.status == "Pending":
            pos = db.query(models.Reservation).filter(
                models.Reservation.book_id == r.book_id,
                models.Reservation.status == "Pending",
                models.Reservation.reservation_date < r.reservation_date
            ).count()
            item.queue_position = pos + 1
        else:
            item.queue_position = 0
            
        output.append(item)
        
    return output

@app.patch("/api/my/notifications/{notif_id}/read")
def mark_notification_read(
    notif_id: int, 
    current_user: Union[models.Member, models.Librarian] = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    notif = db.query(models.Notification).filter(
        models.Notification.id == notif_id,
        models.Notification.member_id == current_user.id # Security check
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    db.commit()
    return {"message": "Marked as read"}

@app.delete("/api/books/{book_id}")
def delete_book(
    book_id: int, 
    current_user: models.Librarian = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """BIM-005: Delete the entire Book record (Title + metadata)"""
    if current_user.role not in ["Librarian", "Admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    book = db.query(models.Book).filter(models.Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    # 1. Check for physical items
    items_count = db.query(models.BookItem).filter(models.BookItem.book_id == book_id).count()
    if items_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete book. There are still {items_count} physical items in inventory. Delete items first."
        )

    # 2. Check for active reservations
    res_count = db.query(models.Reservation).filter(
        models.Reservation.book_id == book_id,
        models.Reservation.status.in_(["Pending", "Fulfilled"])
    ).count()
    if res_count > 0:
        raise HTTPException(
            status_code=400, 
            detail="Cannot delete book. There are active reservations/waitlists for this title."
        )

    db.delete(book)
    db.commit()
    return {"message": "Book title removed from catalog"}

@app.post("/api/my/notifications/read-all")
def mark_all_notifications_read(
    current_user: Union[models.Member, models.Librarian] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """QoL: Clear all alerts for the user"""
    db.query(models.Notification).filter(
        models.Notification.member_id == current_user.id,
        models.Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"message": "All caught up!"}

@app.delete("/api/members/{member_id}")
def delete_member(
    member_id: int,
    current_user: models.Librarian = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Safety: Prevent deleting members with outstanding obligations"""
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Only admins can delete members")

    member = db.query(models.Member).filter(models.Member.id == member_id).first()
    
    # 1. Check for Active Loans
    active_loans = db.query(models.Loan).filter(models.Loan.member_id == member_id, models.Loan.status == "Active").count()
    if active_loans > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete. Member still has {active_loans} books.")

    # 2. Check for Unpaid Fines
    unpaid_fines = db.query(models.Fine).filter(models.Fine.member_id == member_id, models.Fine.status != "Paid").count()
    if unpaid_fines > 0:
        raise HTTPException(status_code=400, detail="Cannot delete. Member has unpaid fines.")

    db.delete(member)
    db.commit()
    return {"message": "Member record removed"}

@app.delete("/api/admin/librarians/{lib_id}")
def delete_librarian(
    lib_id: int,
    current_user: models.Librarian = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Only admins can remove staff")

    staff = db.query(models.Librarian).filter(models.Librarian.id == lib_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")
        
    if staff.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own admin account")

    db.delete(staff)
    db.commit()
    return {"message": "Staff account removed"}

@app.get("/api/books/popular", response_model=list[schemas.BookResponse])
def get_top_popular_books(db: Session = Depends(get_db)):
    """Fetch Top 5 most borrowed books across the whole library"""
    # Use the helper function we wrote in recommendation.py
    popular_ids = recommendation.get_popular_books(db, limit=5)
    
    if not popular_ids:
        # If no loans exist yet, just return the 5 newest books
        return db.query(models.Book).order_by(models.Book.id.desc()).limit(5).all()
        
    books = db.query(models.Book).filter(models.Book.id.in_(popular_ids)).all()
    
    # Calculate available copies for the badges
    for book in books:
        book.available_copies = len([item for item in book.items if item.status == 'Available'])
        
    return books

# --- Static File Serving (Keep this at the end) ---
if os.path.exists("static_ui"):
    app.mount("/assets", StaticFiles(directory="static_ui/assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_react(full_path: str):
        if full_path.startswith("api"):
            return {"error": "API endpoint not found"}
        return FileResponse("static_ui/index.html")