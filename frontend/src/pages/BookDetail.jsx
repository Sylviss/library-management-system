import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { ArrowLeft, Book as BookIcon, Clock, Calendar, Tag, Building, Settings } from 'lucide-react';

export default function BookDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isStaff = user?.role === 'Librarian' || user?.role === 'Admin';

  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        // 1. Fetch Book Details
        const res = await api.get(`/books/${id}`);
        setBook(res.data);

        // 2. Log View (For Recommendation Engine)
        // We only log if it's a Member viewing (Staff views don't count for recommendations)
        if (user && !isStaff) {
          // Fire and forget (don't await)
          api.post(`/books/${id}/view`, { 
            book_id: id, 
            member_id: user.id 
          }).catch(err => console.error("Analytics error", err));
        }

      } catch (error) {
        toast.error("Book not found");
        navigate('/books');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [id, user, isStaff, navigate]);

  // --- Handlers ---
  const handleReserve = async () => {
    if (!window.confirm("Place a reservation for this book?")) return;
    try {
      await api.post('/reservations', { book_id: book.id, member_id: user.id });
      toast.success("Reservation Placed!");
      // Re-fetch to update status if needed
    } catch (error) {
      toast.error(error.response?.data?.detail || "Reservation Failed");
    }
  };

  if (loading) return <div className="p-10 text-center">Loading details...</div>;
  if (!book) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Back Button */}
      <button 
        onClick={() => navigate('/books')} 
        className="flex items-center text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft size={20} className="mr-2" /> Back to Catalog
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-3">
          
          {/* Left: Cover Image */}
          <div className="bg-gray-100 p-8 flex items-center justify-center border-b md:border-b-0 md:border-r border-gray-100">
            {book.cover_image_url ? (
              <img 
                src={book.cover_image_url} 
                alt={book.title} 
                className="w-48 rounded-lg shadow-lg transform transition hover:scale-105" 
              />
            ) : (
              <div className="w-48 h-72 bg-gray-200 rounded-lg flex items-center justify-center text-gray-400">
                <BookIcon size={64} />
              </div>
            )}
          </div>

          {/* Right: Details */}
          <div className="p-8 md:col-span-2 flex flex-col">
            <div className="flex-1">
              {/* Metadata */}
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">{book.title}</h1>
                  <p className="text-xl text-gray-600 font-medium">{book.author}</p>
                </div>
                <div className={`px-4 py-2 rounded-full text-sm font-bold ${
                  book.available_copies > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {book.available_copies} Copies Available
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Tag size={16} className="text-blue-500" />
                  <span>Genre: <strong>{book.genre || 'Uncategorized'}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-blue-500" />
                  <span>Published: <strong>{book.publication_year || 'Unknown'}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <Building size={16} className="text-blue-500" />
                  <span>Publisher: <strong>{book.publisher || 'Unknown'}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">ISBN: {book.isbn}</span>
                </div>
              </div>

              <div className="mt-8">
                <h3 className="font-bold text-gray-900 mb-2">Description</h3>
                <p className="text-gray-600 leading-relaxed">
                  {book.description || "No description available for this book."}
                </p>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="mt-8 pt-6 border-t border-gray-100 flex gap-4">
              {isStaff ? (
                <button 
                  onClick={() => navigate(`/books/${id}/manage`)} // <--- POINT TO NEW PAGE
                  className="w-full bg-gray-900 text-white px-6 py-3 rounded-lg hover:bg-gray-800 font-medium flex justify-center items-center gap-2"
                >
                  <Settings size={20} /> Manage Book & Inventory
                </button>
              ) : (
                book.available_copies === 0 ? (
                  <button 
                    onClick={handleReserve}
                    className="flex-1 bg-orange-600 text-white px-6 py-3 rounded-xl hover:bg-orange-700 font-bold flex justify-center items-center gap-2"
                  >
                    <Clock size={20} /> Place Reservation
                  </button>
                ) : (
                  <div className="flex-1 bg-green-50 text-green-800 px-6 py-3 rounded-xl font-medium border border-green-200 text-center">
                    This book is available! Visit the library to pick it up.
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}