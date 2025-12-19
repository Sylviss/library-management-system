import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import toast from 'react-hot-toast';
import { User, BookOpen, Clock, AlertCircle, ArrowLeft, RefreshCw, Repeat, Trash2 } from 'lucide-react';

export default function MemberDetails() {
  const { id } = useParams(); // Get Member ID from URL
  const navigate = useNavigate();
  
  const [member, setMember] = useState(null);
  const [loans, setLoans] = useState({ active_loans: [], past_loans: [] });
  const [reservations, setReservations] = useState([]);
  const [fines, setFines] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch all data for this member
  const fetchData = async () => {
    try {
      const [memRes, loanRes, resRes, fineRes] = await Promise.all([
        api.get(`/members/${id}`),
        api.get(`/members/${id}/loans`),
        api.get(`/members/${id}/reservations`),
        api.get(`/members/${id}/fines_details`)
      ]);
      
      setMember(memRes.data);
      setLoans(loanRes.data);
      setReservations(resRes.data);
      setFines(fineRes.data);
    } catch (error) {
      toast.error("Failed to load member details");
      navigate('/members'); // Go back if failed
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  // Actions
  const handleRenew = async (loanId) => {
    try {
      await api.post(`/loans/${loanId}/renew`);
      toast.success("Renewed successfully");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Renewal failed");
    }
  };

  const handleCancelRes = async (resId) => {
    if(!window.confirm("Cancel this reservation?")) return;
    try {
      await api.post(`/reservations/${resId}/cancel`);
      toast.success("Reservation canceled");
      fetchData();
    } catch (error) {
      toast.error("Failed to cancel");
    }
  };
  const handleDeleteMember = async () => {
    // Double confirmation for safety
    const confirmFirst = window.confirm(`DANGER: You are about to permanently delete ${member.full_name}. This will wipe their entire loan history. Continue?`);
    if (!confirmFirst) return;

    const confirmSecond = window.confirm("Are you ABSOLUTELY sure? This action is irreversible.");
    if (!confirmSecond) return;

    try {
      await api.delete(`/members/${id}`);
      toast.success("Member account deleted successfully");
      navigate('/members'); // Redirect back to the member list
    } catch (error) {
      // This catches the backend "Safety Guard" error (e.g., if they still have books)
      toast.error(error.response?.data?.detail || "Could not delete member");
    }
  };

  if (loading) return <div className="p-8 text-center">Loading member profile...</div>;

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <button onClick={() => navigate('/members')} className="flex items-center text-gray-500 hover:text-gray-900 mb-4">
        <ArrowLeft size={18} className="mr-1" /> Back to List
      </button>

      {/* Member Profile Card */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-blue-100 p-4 rounded-full text-blue-600">
            <User size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{member.full_name}</h1>
            <p className="text-gray-500">{member.email} • ID: {member.id}</p>
            <div className="mt-2">
               <span className={`px-2 py-1 rounded text-xs font-bold ${member.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                 {member.status}
               </span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">Unpaid Fines</div>
          <div className={`text-2xl font-bold ${fines.some(f => f.status === 'Unpaid') ? 'text-red-600' : 'text-gray-800'}`}>
            ${fines.filter(f => f.status !== 'Paid').reduce((sum, f) => sum + (f.amount - f.amount_paid), 0).toFixed(2)}
          </div>
          <button 
            onClick={() => navigate('/circulation')}
            className="flex items-center gap-2 bg-gray-800 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-gray-900 transition"
          >
            <Repeat size={16} /> Go to Circulation Desk
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* LEFT COL: Active Loans */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold flex items-center gap-2"><BookOpen size={20} /> Active Loans</h2>
          {loans.active_loans.length === 0 ? (
            <p className="text-gray-500 italic">No active loans.</p>
          ) : (
            <div className="space-y-4">
              {loans.active_loans.map(loan => (
                <div key={loan.id} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-mono text-xs bg-gray-100 px-2 py-1 rounded inline-block mb-1">
                        {loan.book_item_id}
                      </div>
                      <div className="text-sm font-medium">Due: {loan.due_date}</div>
                      <div className="text-xs text-gray-500">Renewals: {loan.renewal_count}/2</div>
                    </div>
                    <button 
                      onClick={() => handleRenew(loan.id)}
                      className="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded text-sm font-medium flex items-center gap-1"
                    >
                      <RefreshCw size={14} /> Renew
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT COL: Reservations & Fines */}
        <div className="space-y-8">
          
          {/* Reservations */}
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2 mb-4"><Clock size={20} /> Reservations</h2>
            {reservations.length === 0 ? (
              <p className="text-gray-500 italic">No active reservations.</p>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-3">Book ID</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reservations.map(res => (
                      <tr key={res.id}>
                        <td className="p-3">#{res.book_id}</td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-1 rounded ${res.status === 'Fulfilled' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            {res.status}
                          </span>
                        </td>
                        <td className="p-3">
                          <button onClick={() => handleCancelRes(res.id)} className="text-red-500 hover:underline">Cancel</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent Fines */}
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2 mb-4"><AlertCircle size={20} /> Fine History</h2>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden max-h-60 overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3">Reason</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {fines.map(fine => (
                    <tr key={fine.id}>
                      <td className="p-3">{fine.reason}</td>
                      <td className="p-3">${fine.amount}</td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-1 rounded ${fine.status === 'Paid' ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-600'}`}>
                          {fine.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
            {/* --- NEW: Member Danger Zone --- */}
          <div className="mt-12 pt-8 border-t border-red-100">
            <h3 className="text-red-600 font-bold flex items-center gap-2 mb-4 uppercase tracking-wider text-sm">
              <Trash2 size={18} /> Danger Zone
            </h3>
            <div className="bg-white p-6 rounded-xl border-2 border-red-50 flex flex-col md:flex-row justify-between items-center gap-4">
              <div>
                <p className="text-gray-900 font-bold">Permanently Delete Account</p>
                <p className="text-gray-500 text-sm max-w-md">
                  The user must have returned all books and paid all fines before deletion is possible. 
                  All historical loan data for this user will be lost.
                </p>
              </div>
              <button 
                onClick={handleDeleteMember}
                className="w-full md:w-auto bg-red-50 text-red-600 border border-red-200 px-6 py-2 rounded-lg hover:bg-red-600 hover:text-white font-bold transition-all shadow-sm"
              >
                Delete Member
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}