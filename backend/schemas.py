from pydantic import BaseModel
from typing import List, Optional
from datetime import date,datetime

class BookBase(BaseModel):
    title: str
    author: str
    isbn: Optional[str] = None
    publisher: Optional[str] = None
    publication_year: Optional[str] = None
    genre: Optional[str] = None
    description: Optional[str] = None
    cover_image_url: Optional[str] = None

class BookCreate(BookBase):
    pass

class BookResponse(BookBase):
    id: int
    available_copies: int = 0

    class Config:
        from_attributes = True

# --- Book Item Schemas ---

class BookItemCreate(BaseModel):
    barcode: str
    status: str = "Available"

class BookItemResponse(BookItemCreate):
    book_id: int
    date_acquired: datetime  # <--- 2. CHANGE THIS from 'date' to 'datetime'

    class Config:
        from_attributes = True

# --- External Import Schema ---
class GoogleImportRequest(BaseModel):
    query: str # Can be ISBN or Title
    
# --- Member Schemas ---
class MemberCreate(BaseModel):
    email: str
    password: str
    full_name: str
    phone_number: Optional[str] = None
    address: Optional[str] = None

class MemberResponse(BaseModel):
    id: int
    email: str
    full_name: str
    status: str
    total_fines_due: float = 0.0 # We will compute this or add to model

    class Config:
        from_attributes = True

# --- Circulation Schemas ---
class LoanIssueRequest(BaseModel):
    member_id: int
    book_item_barcode: str
    days: int = 14  # Default loan period

class LoanReturnRequest(BaseModel):
    book_item_barcode: str
    condition: str = "Good" # "Good" or "Damaged"

class LoanResponse(BaseModel):
    id: int
    book_item_id: str
    member_id: int
    issue_date: date
    due_date: date
    return_date: Optional[date] = None
    status: str
    renewal_count: int = 0  # <--- Add this linessss
    
    class Config:
        from_attributes = True
        
class ReservationCreate(BaseModel):
    book_id: int
    member_id: int

class ReservationResponse(BaseModel):
    id: int
    book_id: int
    member_id: int
    reservation_date: datetime
    status: str
    queue_position: Optional[int] = None  # <--- NEW FIELD

    # NEW FIELDS (computed)
    member_name: Optional[str] = None
    book_title: Optional[str] = None
    
    class Config:
        from_attributes = True

# --- Fine Schemas ---
class FineResponse(BaseModel):
    id: int
    amount: float
    amount_paid: float = 0.0  # <--- ADD THIS LINE
    reason: str
    status: str
    created_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
        
# --- Auth Schemas ---
class LoginRequest(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str       # 'Member' or 'Librarian'
    user_id: int    # Useful for the frontend to know who is logged in
    
# --- Self-Service Schemas ---
class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    address: Optional[str] = None

class PasswordChange(BaseModel):
    old_password: str
    new_password: str

class LoanHistoryResponse(BaseModel):
    active_loans: List[LoanResponse]
    past_loans: List[LoanResponse]
    
class MemberStatusUpdate(BaseModel):
    status: str  # e.g., "Active", "Deactivated", "Blocked"

class BookUpdate(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    publisher: Optional[str] = None
    genre: Optional[str] = None
    description: Optional[str] = None
    cover_image_url: Optional[str] = None

class DashboardStats(BaseModel):
    total_members: int
    total_titles: int
    total_items: int
    active_loans: int
    pending_reservations: int
    total_fines_unpaid: float
    
# Add to backend/schemas.py

# --- Librarian Management ---
class LibrarianCreate(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "Librarian" # 'Librarian' or 'Admin'

class LibrarianResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    
    class Config:
        from_attributes = True

# --- Reports ---
class OverdueReportItem(BaseModel):
    loan_id: int
    book_title: str
    member_email: str
    due_date: date
    days_overdue: int
    
    
class NotificationResponse(BaseModel):
    id: int
    message: str
    created_at: datetime
    is_read: bool
    class Config:
        from_attributes = True

class FinePaymentRequest(BaseModel):
    amount: float # Partial amount

class MarkLostRequest(BaseModel):
    replacement_fee: float

# --- Report Schemas ---
class ActiveLoanReportItem(BaseModel):
    loan_id: int
    book_title: str
    member_email: str
    issue_date: date
    due_date: date

class MemberActivityReportItem(BaseModel):
    member_id: int
    full_name: str
    email: str
    total_loans: int
    active_loans_count: int
    total_fines_paid: float
    
class BookItemDetail(BaseModel):
    barcode: str
    status: str
    book_title: str
    book_author: str
    book_cover: Optional[str] = None
    reserved_for: Optional[List[str]] = [] 
    
    # NEW FIELDS
    current_borrower_id: Optional[int] = None
    current_borrower_name: Optional[str] = None
    due_date: Optional[date] = None # Helpful for preview
    
    class Config:
        from_attributes = True