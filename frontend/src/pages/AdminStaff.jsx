import { useState, useEffect } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { Shield, UserPlus, Key, Trash2  } from 'lucide-react';

export default function AdminStaff() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Create Modal
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ email: '', full_name: '', password: '123' });

  // Reset Password State
  const [resetId, setResetId] = useState(null); // ID of user being reset
  const [newPass, setNewPass] = useState('');

  const fetchStaff = async () => {
    try {
      const res = await api.get('/admin/librarians');
      setStaff(res.data);
    } catch (error) {
      toast.error("Failed to load staff list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/librarians', { ...formData, role: 'Librarian' });
      toast.success("Staff member added");
      setShowModal(false);
      setFormData({ email: '', full_name: '', password: '123' });
      fetchStaff();
    } catch (error) {
      toast.error("Failed to create account");
    }
  };

  const handleReset = async () => {
    if (!newPass) return toast.error("Enter a new password");
    try {
      await api.post(`/admin/librarians/${resetId}/reset-password?new_password=${newPass}`);
      toast.success("Password reset successfully");
      setResetId(null);
      setNewPass('');
    } catch (error) {
      toast.error("Reset failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Shield className="text-purple-600" /> Staff Administration
          </h1>
          <p className="text-gray-500">Manage librarian accounts and permissions</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 flex items-center gap-2"
        >
          <UserPlus size={20} /> Add Librarian
        </button>
      </div>

      {/* Staff List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-gray-700 border-b">
            <tr>
              <th className="p-4">Name</th>
              <th className="p-4">Email</th>
              <th className="p-4">Role</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {staff.map(s => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="p-4 font-medium">{s.full_name}</td>
                <td className="p-4 text-gray-600">{s.email}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    s.role === 'Admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {s.role}
                  </span>
                </td>
                <td className="p-4 text-right">
                  {s.role !== 'Admin' && (
                    <button 
                      onClick={() => setResetId(s.id)}
                      className="text-gray-500 hover:text-purple-600 text-sm flex items-center gap-1 ml-auto"
                    >
                      <Key size={16} /> Reset Password
                    </button>
                  )}
                </td>
                <td className="p-4 text-right flex gap-3 justify-end">
                  <button onClick={() => setResetId(s.id)} className="..."> <Key size={16}/> </button>
                  
                  {/* NEW: Delete Button */}
                  {s.role !== 'Admin' && (
                    <button 
                      onClick={async () => {
                        if(window.confirm(`Delete staff account ${s.full_name}?`)) {
                          await api.delete(`/admin/librarians/${s.id}`);
                          fetchStaff();
                          toast.success("Staff removed");
                        }
                      }}
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">Add New Librarian</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input required type="text" className="w-full border p-2 rounded" 
                  value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input required type="email" className="w-full border p-2 rounded" 
                  value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <input required type="text" className="w-full border p-2 rounded" 
                  value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setShowModal(false)} className="text-gray-500 px-4 py-2">Cancel</button>
                <button type="submit" className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold mb-2">Reset Password</h2>
            <p className="text-sm text-gray-500 mb-4">Enter new password for this user.</p>
            <input 
              type="text" 
              className="w-full border p-2 rounded mb-4" 
              placeholder="New Password"
              value={newPass}
              onChange={e => setNewPass(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => {setResetId(null); setNewPass('')}} className="text-gray-500 px-4 py-2">Cancel</button>
              <button onClick={handleReset} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">Reset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}