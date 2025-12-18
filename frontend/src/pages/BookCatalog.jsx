import { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { Search, Plus, Book as BookIcon, Download, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

export default function BookCatalog() {
  const { user } = useAuth();
  const isStaff = user?.role === 'Librarian' || user?.role === 'Admin';

  const [books, setBooks] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Import Modal State
  const [showImport, setShowImport] = useState(false);
  const [importQuery, setImportQuery] = useState('');

  // --- 1. Fetch Data ---
  const fetchBooks = async (query = '') => {
    try {
      setLoading(true);
      const res = await api.get(`/books?search=${query}`);
      setBooks(res.data);
    } catch (error) {
      toast.error("Failed to load catalog");
    } finally {
      setLoading(false);
    }
  };

  const fetchRecommendations = async () => {
    // Only fetch for members
    if (!isStaff && user?.id) {
      try {
        const res = await api.get(`/recommendations?member_id=${user.id}`);
        setRecommendations(res.data);
      } catch (error) {
        console.error("ML Error", error);
      }
    }
  };

  const handleReserve = async (bookId) => {
    if (!window.confirm("Confirm reservation for this book?")) return;
    
    const toastId = toast.loading("Processing reservation...");
    try {
      await api.post('/reservations', {
        book_id: bookId,
        member_id: user.id
      });
      toast.success("Book Reserved! You will be notified when available.", { id: toastId });
      // Refresh catalog to maybe update UI state if needed
      fetchBooks(search); 
    } catch (error) {
      toast.error(error.response?.data?.detail || "Reservation Failed", { id: toastId });
    }
  };

  useEffect(() => {
    fetchBooks();
    fetchRecommendations();
  }, [user]); // Re-run if user changes (login)

  // --- 2. Handlers ---
  const handleSearch = (e) => {
    e.preventDefault();
    fetchBooks(search);
  };

  const handleImport = async (e) => {
    e.preventDefault();
    if (!importQuery) return;
    
    const toastId = toast.loading("Searching Google Books...");
    try {
      // Call our Backend Import Endpoint
      await api.post('/books/import', { query: importQuery });
      toast.success("Book Imported Successfully!", { id: toastId });
      setShowImport(false);
      setImportQuery('');
      fetchBooks(); // Refresh list
    } catch (error) {
      toast.error("Book not found or import failed", { id: toastId });
    }
  };

  // --- 3. Render Helpers ---
  const BookCard = ({ book, highlight = false }) => (
    <div className={`bg-white rounded-xl shadow-sm border p-4 flex flex-col h-full ${highlight ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-100'}`}>
      <div className="h-48 bg-gray-200 rounded-lg mb-4 overflow-hidden flex items-center justify-center">
        {book.cover_image_url ? (
          <img src={book.cover_image_url} alt={book.title} className="h-full object-cover" />
        ) : (
          <BookIcon size={48} className="text-gray-400" />
        )}
      </div>
      
      <h3 className="font-bold text-gray-900 line-clamp-1" title={book.title}>{book.title}</h3>
      <p className="text-sm text-gray-500 mb-2">{book.author}</p>
      
      <div className="mt-auto pt-4 border-t border-gray-100 flex justify-between items-center">
        <span className={`text-xs px-2 py-1 rounded-full ${book.available_copies > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {book.available_copies} Available
        </span>
        
        {/* Action Buttons */}
        {isStaff ? (
          <button className="text-blue-600 text-sm font-medium hover:underline">
            Manage
          </button>
        ) : (
          book.available_copies === 0 ? (
            <button 
              onClick={() => handleReserve(book.id)} // <--- ATTACHED HANDLER
              className="text-orange-600 text-sm font-bold hover:bg-orange-50 px-2 py-1 rounded transition-colors flex items-center gap-1"
            >
              <Clock size={14} /> Reserve
            </button>
          ) : (
            <span className="text-gray-400 text-xs">Available Now</span>
          )
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Library Catalog</h1>
          <p className="text-gray-500">Browse {books.length} titles in our collection</p>
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          <form onSubmit={handleSearch} className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search title, author..." 
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
          
          {isStaff && (
            <button 
              onClick={() => setShowImport(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Download size={18} /> Import
            </button>
          )}
        </div>
      </div>

      {/* Recommendations Section (Members Only) */}
      {!isStaff && recommendations.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-100">
          <h2 className="text-xl font-bold text-blue-900 mb-4 flex items-center gap-2">
            ✨ Recommended For You
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {recommendations.map(book => <BookCard key={book.id} book={book} highlight />)}
          </div>
        </div>
      )}

      {/* Main Catalog Grid */}
      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading library...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {books.map(book => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      )}

      {/* Import Modal (Staff Only) */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold mb-4">Import from Google Books</h3>
            <p className="text-gray-500 text-sm mb-4">
              Enter an ISBN (preferred) or Book Title. The system will auto-fetch details.
            </p>
            <input 
              type="text" 
              placeholder="e.g. 9780132350884 or Clean Code"
              className="w-full border p-3 rounded-lg mb-4"
              value={importQuery}
              onChange={(e) => setImportQuery(e.target.value)}
            />
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowImport(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button 
                onClick={handleImport}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Search & Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}