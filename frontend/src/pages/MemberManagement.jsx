import { useState, useEffect } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { Search, UserPlus, Shield, ShieldOff, User } from 'lucide-react';

export default function MemberManagement() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ email: '', full_name: '', password: '123' });

  // --- 1. Fetch Members (Search) ---
  const fetchMembers = async (searchQ = '') => {
    try {
      setLoading(true);
      // Backend: %{q}% matches everything if q is empty string
      const res = await api.get(`/members/search?q=${searchQ}`);
      setMembers(res.data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to fetch members");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchMembers(query);
  };

  // --- 2. Actions (Block/Unblock) ---
  const toggleStatus = async (member) => {
    const newStatus = member.status === 'Active' ? 'Blocked' : 'Active';
    const confirmMsg = `Are you sure you want to ${newStatus === 'Blocked' ? 'BLOCK' : 'ACTIVATE'} ${member.full_name}?`;
    
    if (!window.confirm(confirmMsg)) return;

    try {
      await api.patch(`/members/${member.id}/status`, { status: newStatus });
      toast.success(`User ${newStatus}`);
      fetchMembers(query); // Refresh list
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  // --- 3. Add Member ---
  const handleAddMember = async (e) => {
    e.preventDefault();
    try {
      await api.post('/members', formData);
      toast.success("Member Registered Successfully!");
      setShowModal(false);
      setFormData({ email: '', full_name: '', password: '123' });
      fetchMembers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Registration Failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Member Management</h1>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <UserPlus size={20} /> Register New
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input 
              type="text" 
              placeholder="Search by name, email..." 
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button type="submit" className="bg-gray-100 px-6 rounded-lg hover:bg-gray-200 font-medium">
            Search
          </button>
        </form>
      </div>

      {/* Member Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-gray-700 border-b">
            <tr>
              <th className="p-4">Name</th>
              <th className="p-4">Email</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {members.map(member => (
              <tr key={member.id} className="hover:bg-gray-50">
                <td className="p-4 font-medium flex items-center gap-3">
                  <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                    <User size={16} />
                  </div>
                  {member.full_name}
                </td>
                <td className="p-4 text-gray-600">{member.email}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    member.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {member.status}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <button 
                    onClick={() => toggleStatus(member)}
                    className={`text-sm font-medium hover:underline ${
                      member.status === 'Active' ? 'text-red-600' : 'text-green-600'
                    }`}
                  >
                    {member.status === 'Active' ? 'Block Account' : 'Activate Account'}
                  </button>
                </td>
              </tr>
            ))}
            {members.length === 0 && !loading && (
              <tr>
                <td colSpan="4" className="p-8 text-center text-gray-500">No members found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Registration Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">Register New Member</h2>
            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Full Name</label>
                <input 
                  required type="text" className="w-full border p-2 rounded-lg"
                  value={formData.full_name}
                  onChange={e => setFormData({...formData, full_name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input 
                  required type="email" className="w-full border p-2 rounded-lg"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Initial Password</label>
                <input 
                  required type="text" className="w-full border p-2 rounded-lg"
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                />
              </div>
              
              <div className="flex justify-end gap-2 mt-6">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}