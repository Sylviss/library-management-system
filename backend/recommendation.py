import pandas as pd
from sklearn.neighbors import NearestNeighbors
from sqlalchemy.orm import Session
from sqlalchemy import func
import models

def get_popular_books(db: Session, limit: int = 5):
    """Fallback: Returns the book_ids with the most loans"""
    # SQL: SELECT book_id, COUNT(*) FROM loans JOIN book_items ... GROUP BY book_id ORDER BY DESC
    results = db.query(models.BookItem.book_id, func.count(models.Loan.id).label('count'))\
        .join(models.Loan, models.Loan.book_item_id == models.BookItem.barcode)\
        .group_by(models.BookItem.book_id)\
        .order_by(func.count(models.Loan.id).desc())\
        .limit(limit).all()
    
    # Extract just the IDs
    return [r.book_id for r in results]

def recommend_books(db: Session, member_id: int, limit: int = 5):
    """
    Weighted Hybrid Recommendation:
    - Loan = 5 points
    - View = 1 point
    """
    
    # 1. Fetch Loans (Strong Signal)
    # Join Loan -> BookItem to get the Abstract Book ID
    query_loans = db.query(
        models.Loan.member_id, 
        models.BookItem.book_id
    ).join(models.BookItem, models.Loan.book_item_id == models.BookItem.barcode).statement
    
    df_loans = pd.read_sql(query_loans, db.bind)
    df_loans['score'] = 5  # Assign weight

    # 2. Fetch Views (Weak Signal)
    query_views = db.query(
        models.BookView.member_id,
        models.BookView.book_id
    ).statement

    df_views = pd.read_sql(query_views, db.bind)
    df_views['score'] = 1  # Assign weight

    # 3. Merge Dataframes
    df_all = pd.concat([df_loans, df_views])

    if df_all.empty:
        return []

    # 4. Aggregate Scores
    # If a user viewed a book 3 times (3 pts) and borrowed it (5 pts), total = 8 pts
    df_weighted = df_all.groupby(['member_id', 'book_id'])['score'].sum().reset_index()

    # --- Check User History ---
    # We check if the user has ANY interaction (View OR Loan)
    user_history = df_weighted[df_weighted['member_id'] == member_id]
    if len(user_history) == 0:
        return get_popular_books(db, limit)

    # 5. Create Weighted Matrix
    # Values are now Integers (e.g., 1, 5, 6), not just 0/1
    pivot_table = df_weighted.pivot(index='member_id', columns='book_id', values='score').fillna(0)

    # 6. Fit Model
    model = NearestNeighbors(metric='cosine', algorithm='brute')
    model.fit(pivot_table)

    if member_id not in pivot_table.index:
         return get_popular_books(db, limit)

    # 7. Find Neighbors
    user_vector = pivot_table.loc[member_id].values.reshape(1, -1)
    distances, indices = model.kneighbors(user_vector, n_neighbors=min(4, len(pivot_table)))

    # 8. Extract Recommendations
    similar_users_indices = indices.flatten()
    recommended_books = []
    already_interacted = set(user_history['book_id']) # Don't recommend books they already saw/read

    for idx in similar_users_indices:
        neighbor_id = pivot_table.index[idx]
        if neighbor_id == member_id:
            continue
            
        # Get neighbor's top rated books (Sort by score descending)
        neighbor_data = df_weighted[df_weighted['member_id'] == neighbor_id].sort_values('score', ascending=False)
        
        for book_id in neighbor_data['book_id']:
            if book_id not in already_interacted and book_id not in recommended_books:
                recommended_books.append(book_id)
                if len(recommended_books) >= limit:
                    return recommended_books

    if not recommended_books:
        return get_popular_books(db, limit)
        
    return recommended_books