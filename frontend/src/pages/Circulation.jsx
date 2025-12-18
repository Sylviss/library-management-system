import { useState } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { Search, ArrowRight, ArrowLeft, Clock, User, BookOpen } from 'lucide-react';

export default function Circulation() {
  const [activeTab, setActiveTab] = useState('issue'); // 'issue', 'return', 'history'

  // --- Issue State ---
  const [memberQuery, setMemberQuery] = useState('');
  const [foundMembers, setFoundMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [issueBarcode, setIssueBarcode] = useState('');

  // --- Return State ---
  const [returnBarcode, setReturnBarcode] = useState('');
  const [returnCondition, setReturnCondition] = useState('Good');
  const [returnResult, setReturnResult] = useState(null);

  // --- Handlers ---

  const searchMembers = async (e) => {
    e.preventDefault();
    if (!memberQuery) return;
    try {
      const res = await api.get(`/members/search?q=${memberQuery}`);
      setFoundMembers(res.data);
      if (res.data.length === 0) toast("No members found");
    } catch (error) {
      toast.error("Search failed");
    }
  };

  const handleIssue = async (e) => {
    e.preventDefault();
    if (!selectedMember || !issueBarcode) return;

    try {
      await api.post('/loans/issue', {
        member_id: selectedMember.id,
        book_item_barcode: issueBarcode,
        days: 14 // Default logic
      });
      toast.success("Book Issued Successfully!");
      setIssueBarcode(''); // Clear for next scan
    } catch (error) {
      toast.error(error.response?.data?.detail || "Issue failed");
    }
  };

  const handleReturn = async (e) => {
    e.preventDefault();
    if (!returnBarcode) return;

    try {
      const res = await api.post('/loans/return', {
        book_item_barcode: returnBarcode,
        condition: returnCondition
      });
      
      setReturnResult(res.data);
      toast.success("Book Returned");
      
      // Check for alerts (Fines/Reservations) in the backend response logic
      // Note: In a real app, we'd check specific flags. 
      // For now, we rely on the backend logic we wrote to print/handle it.
      
      setReturnBarcode('');
    } catch (error) {
      toast.error(error.response?.data?.detail || "Return failed");
      setReturnResult(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Circulation Desk</h1>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('issue')}
          className={`px-6 py-3 font-medium text-sm transition-colors ${
            activeTab === 'issue' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Issue Book
        </button>
        <button
          onClick={() => setActiveTab('return')}
          className={`px-6 py-3 font-medium text-sm transition-colors ${
            activeTab === 'return' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Return Book
        </button>
      </div>

      {/* --- ISSUE TAB --- */}
      {activeTab === 'issue' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Step 1: Find Member */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <User className="text-blue-500" /> 1. Identify Member
            </h2>
            
            {!selectedMember ? (
              <>
                <form onSubmit={searchMembers} className="flex gap-2 mb-4">
                  <input
                    type="text"
                    placeholder="Name, Email, or Phone..."
                    className="flex-1 border rounded-lg px-4 py-2"
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                  />
                  <button type="submit" className="bg-gray-100 p-2 rounded-lg hover:bg-gray-200">
                    <Search size={20} />
                  </button>
                </form>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {foundMembers.map(member => (
                    <div 
                      key={member.id}
                      onClick={() => setSelectedMember(member)}
                      className="p-3 border rounded-lg cursor-pointer hover:bg-blue-50 transition flex justify-between items-center"
                    >
                      <div>
                        <div className="font-medium">{member.full_name}</div>
                        <div className="text-sm text-gray-500">{member.email}</div>
                      </div>
                      <div className={`text-xs px-2 py-1 rounded ${member.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {member.status}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-6">
                <div className="inline-block p-4 bg-blue-100 rounded-full mb-3">
                  <User size={32} className="text-blue-600" />
                </div>
                <h3 className="text-xl font-bold">{selectedMember.full_name}</h3>
                <p className="text-gray-500 mb-4">{selectedMember.email}</p>
                <button 
                  onClick={() => { setSelectedMember(null); setFoundMembers([]); }}
                  className="text-sm text-red-500 hover:underline"
                >
                  Change Member
                </button>
              </div>
            )}
          </div>

          {/* Step 2: Scan Book */}
          <div className={`bg-white p-6 rounded-xl shadow-sm border border-gray-100 ${!selectedMember ? 'opacity-50 pointer-events-none' : ''}`}>
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <BookOpen className="text-blue-500" /> 2. Scan Book
            </h2>
            <form onSubmit={handleIssue}>
              <label className="block text-sm text-gray-600 mb-2">Book Item Barcode</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Scan barcode..."
                  className="flex-1 border rounded-lg px-4 py-2 font-mono"
                  value={issueBarcode}
                  onChange={(e) => setIssueBarcode(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="bg-blue-600 text-white px-6 rounded-lg hover:bg-blue-700">
                  Issue
                </button>
              </div>
            </form>
            <p className="text-xs text-gray-400 mt-4">
              * System will automatically check for fines and loan limits.
            </p>
          </div>
        </div>
      )}

      {/* --- RETURN TAB --- */}
      {activeTab === 'return' && (
        <div className="max-w-xl mx-auto">
          <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
            <h2 className="text-2xl font-bold mb-6 text-center">Return Processor</h2>
            
            <form onSubmit={handleReturn} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Item Barcode</label>
                <input
                  type="text"
                  placeholder="Scan barcode here..."
                  className="w-full text-2xl p-4 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition font-mono text-center"
                  value={returnBarcode}
                  onChange={(e) => setReturnBarcode(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Condition</label>
                <select 
                  className="w-full border p-3 rounded-lg"
                  value={returnCondition}
                  onChange={(e) => setReturnCondition(e.target.value)}
                >
                  <option value="Good">Good</option>
                  <option value="Damaged">Damaged</option>
                </select>
              </div>

              <button type="submit" className="w-full bg-green-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-700 shadow-lg hover:shadow-xl transition transform hover:-translate-y-0.5">
                Process Return
              </button>
            </form>

            {/* Result Display */}
            {returnResult && (
              <div className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200 animate-fade-in">
                <div className="flex items-center gap-2 mb-2 text-green-700 font-bold">
                  <ArrowLeft size={20} /> Returned Successfully
                </div>
                <div className="text-sm space-y-1 text-gray-600">
                  <p>Transaction ID: #{returnResult.id}</p>
                  <p>Return Date: {returnResult.return_date}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    (Check Dashboard or Item History for specific status updates like Reservations or Fines)
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}