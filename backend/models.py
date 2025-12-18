from sqlalchemy import Column, Integer, String, Boolean, Date, ForeignKey, Float, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

# --- Users ---

class Member(Base):
    __tablename__ = "members"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    phone_number = Column(String, nullable=True)
    address = Column(String, nullable=True)
    date_registered = Column(DateTime(timezone=True), server_default=func.now())
    
    # Status: 'Active', 'Deactivated', 'Blocked'
    status = Column(String, default="Active") 
    notifications = relationship("Notification", back_populates="member")
    # Relationships
    loans = relationship("Loan", back_populates="member")
    reservations = relationship("Reservation", back_populates="member")
    fines = relationship("Fine", back_populates="member")

class Librarian(Base):
    __tablename__ = "librarians"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    
    # Role: 'Librarian', 'Admin'
    role = Column(String, default="Librarian") 
    is_active = Column(Boolean, default=True)


# --- Books & Inventory ---

class Book(Base):
    """The Abstract Book (Bibliographic Info)"""
    __tablename__ = "books"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True, nullable=False)
    author = Column(String, index=True, nullable=False)
    isbn = Column(String, unique=True, index=True, nullable=True)
    publisher = Column(String, nullable=True)
    publication_year = Column(String, nullable=True)
    genre = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    cover_image_url = Column(String, nullable=True)

    # Relationships
    items = relationship("BookItem", back_populates="book")
    reservations = relationship("Reservation", back_populates="book")

class BookItem(Base):
    """The Physical Copy on the shelf"""
    __tablename__ = "book_items"

    barcode = Column(String, primary_key=True, index=True) # Physical barcode sticker
    book_id = Column(Integer, ForeignKey("books.id"))
    
    # Status: 'Available', 'Borrowed', 'Lost', 'Maintenance'
    status = Column(String, default="Available") 
    date_acquired = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship
    book = relationship("Book", back_populates="items")
    loans = relationship("Loan", back_populates="book_item")


# --- Circulation (Transactions) ---

class Loan(Base):
    __tablename__ = "loans"

    id = Column(Integer, primary_key=True, index=True)
    book_item_id = Column(String, ForeignKey("book_items.barcode"))
    member_id = Column(Integer, ForeignKey("members.id"))
    
    issue_date = Column(Date, default=func.now())
    due_date = Column(Date, nullable=False)
    return_date = Column(Date, nullable=True)
    
    # NEW FIELD
    renewal_count = Column(Integer, default=0) 
    
    status = Column(String, default="Active")

    # Relationships (Keep existing code)
    book_item = relationship("BookItem", back_populates="loans")
    member = relationship("Member", back_populates="loans")
    fine = relationship("Fine", back_populates="loan", uselist=False)

class Reservation(Base):
    __tablename__ = "reservations"

    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(Integer, ForeignKey("books.id")) # Reserving the Title, not specific item
    member_id = Column(Integer, ForeignKey("members.id"))
    reservation_date = Column(DateTime(timezone=True), server_default=func.now())
    
    # Status: 'Pending', 'Fulfilled', 'Canceled'
    status = Column(String, default="Pending")

    # Relationships
    book = relationship("Book", back_populates="reservations")
    member = relationship("Member", back_populates="reservations")


    
class BookView(Base):
    """Tracks member clicks/views on book pages"""
    __tablename__ = "book_views"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("members.id"))
    book_id = Column(Integer, ForeignKey("books.id"))
    view_date = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    member = relationship("Member")
    book = relationship("Book")
    
class Fine(Base):
    __tablename__ = "fines"

    id = Column(Integer, primary_key=True, index=True)
    loan_id = Column(Integer, ForeignKey("loans.id"))
    member_id = Column(Integer, ForeignKey("members.id"))
    amount = Column(Float, nullable=False)     # Total fine assessed
    amount_paid = Column(Float, default=0.0)   # NEW: Track partial payments
    reason = Column(String, default="Overdue")
    
    # Status: 'Unpaid', 'Partial', 'Paid'
    status = Column(String, default="Unpaid")

    # Relationships
    loan = relationship("Loan", back_populates="fine")
    member = relationship("Member", back_populates="fines")

# --- New Notification Class ---
class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("members.id"))
    message = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_read = Column(Boolean, default=False)

    member = relationship("Member", back_populates="notifications")
