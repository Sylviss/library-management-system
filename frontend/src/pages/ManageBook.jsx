import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import toast from 'react-hot-toast';
import { Save, Plus, Trash2, ArrowLeft, Barcode, FileText } from 'lucide-react';

export default function ManageBook() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('details'); // 'details' or 'inventory'
  const [loading, setLoading] = useState(true);

  // Data State
  const [book, setBook] = useState({});
  const [items, setItems] = useState([]);
  
  // Add Item State
  const [newBarcode, setNewBarcode] = useState('');

  // --- Fetch Data ---
  const loadData = async () => {
    try {
      const [bookRes, itemsRes] = await Promise.all([
        api.get(`/books/${id}`),
        api.get(`/books/${id}/items`)
      ]);
      setBook(bookRes.data);
      setItems(itemsRes.data);
    } catch (error) {
      toast.error("Failed to load book data");
      navigate('/books');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  // --- Handlers: Edit Details ---
  const handleUpdateBook = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/books/${id}`, {
        title: book.title,
        author: book.author,
        description: book.description,
        genre: book.genre,
        cover_image_url: book.cover_image_url
      });
      toast.success("Book details updated");
    } catch (error) {
      toast.error("Update failed");
    }
  };

  // --- Handlers: Inventory ---
  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newBarcode) return;
    try {
      await api.post(`/books/${id}/items`, { barcode: newBarcode });
      toast.success("Copy added to inventory");
      setNewBarcode('');
      loadData(); // Refresh list
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to add item");
    }
  };

  const handleDeleteItem = async (barcode) => {
    if (!window.confirm(`Permanently delete item ${barcode}?`)) return;
    try {
      await api.delete(`/items/${barcode}`);
      toast.success("Item deleted");
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Delete failed");
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button onClick={() => navigate(`/books/${id}`)} className="flex items-center text-gray-500 hover:text-gray-900">
        <ArrowLeft size={18} className="mr-1" /> Back to View
      </button>

      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Manage: {book.title}</h1>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-t-xl border-b border-gray-200 flex">
        <button
          onClick={() => setActiveTab('details')}
          className={`flex items-center gap-2 px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'details' ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500'
          }`}
        >
          <FileText size={18} /> Edit Details
        </button>
        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex items-center gap-2 px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'inventory' ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500'
          }`}
        >
          <Barcode size={18} /> Inventory ({items.length})
        </button>
      </div>

      <div className="bg-white rounded-b-xl shadow-sm border border-t-0 border-gray-100 p-6">
        
        {/* --- TAB 1: Edit Details --- */}
        {activeTab === 'details' && (
          <form onSubmit={handleUpdateBook} className="space-y-4 max-w-2xl">
            <div>
              <label className="block text-sm font-medium text-gray-700">Title</label>
              <input type="text" className="w-full border p-2 rounded mt-1" 
                value={book.title} onChange={e => setBook({...book, title: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Author</label>
                <input type="text" className="w-full border p-2 rounded mt-1" 
                  value={book.author} onChange={e => setBook({...book, author: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Genre</label>
                <input type="text" className="w-full border p-2 rounded mt-1" 
                  value={book.genre || ''} onChange={e => setBook({...book, genre: e.target.value})} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Cover Image URL</label>
              <input type="text" className="w-full border p-2 rounded mt-1 text-sm text-gray-600" 
                value={book.cover_image_url || ''} onChange={e => setBook({...book, cover_image_url: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea className="w-full border p-2 rounded mt-1 h-32" 
                value={book.description || ''} onChange={e => setBook({...book, description: e.target.value})} />
            </div>
            <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2">
              <Save size={18} /> Save Changes
            </button>
          </form>
        )}

        {/* --- TAB 2: Inventory --- */}
        {activeTab === 'inventory' && (
          <div className="space-y-8">
            {/* Add Item Form */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h3 className="font-bold text-gray-800 mb-2">Add Physical Copy</h3>
              <form onSubmit={handleAddItem} className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Scan or enter new barcode..." 
                  className="flex-1 border p-2 rounded"
                  value={newBarcode}
                  onChange={e => setNewBarcode(e.target.value)}
                />
                <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 flex items-center gap-2">
                  <Plus size={18} /> Add Item
                </button>
              </form>
            </div>

            {/* Items List */}
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="p-3">Barcode</th>
                  <th className="p-3">Acquired</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map(item => (
                  <tr key={item.barcode}>
                    <td className="p-3 font-mono font-medium">{item.barcode}</td>
                    <td className="p-3">{new Date(item.date_acquired).toLocaleDateString()}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs ${
                        item.status === 'Available' ? 'bg-green-100 text-green-800' :
                        item.status === 'Borrowed' ? 'bg-blue-100 text-blue-800' :
                        item.status === 'Lost' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {/* Only allow deleting if not borrowed */}
                      {item.status !== 'Borrowed' && (
                        <button 
                          onClick={() => handleDeleteItem(item.barcode)}
                          className="text-red-500 hover:text-red-700 p-1"
                          title="Remove from inventory"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}