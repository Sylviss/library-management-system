import { useState, useEffect } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { Clock, RefreshCw, CheckCircle, AlertTriangle, BookOpen } from 'lucide-react';

export default function MyLoans() {
  const [loans, setLoans] = useState({ active_loans: [], past_loans: [] });
  const [loading, setLoading] = useState(true);

  const fetchLoans = async () => {
    try {
      const res = await api.get('/my/loans');
      setLoans(res.data);
    } catch (error) {
      toast.error("Failed to load loans");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoans();
  }, []);

  const handleRenew = async (loanId) => {
    const toastId = toast.loading("Renewing...");
    try {
      await api.post(`/loans/${loanId}/renew`);
      toast.success("Book Renewed! Due date extended.", { id: toastId });
      fetchLoans(); // Refresh data to show new date
    } catch (error) {
      toast.error(error.response?.data?.detail || "Renewal Failed", { id: toastId });
    }
  };

  const getDaysRemaining = (dueDate) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays;
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading your library records...</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      
      {/* --- Section 1: Active Loans --- */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <BookOpen className="text-blue-600" /> Currently Borrowed
        </h1>

        {loans.active_loans.length === 0 ? (
          <div className="bg-white p-8 rounded-xl text-center text-gray-500 border border-gray-100">
            You don't have any books checked out right now.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loans.active_loans.map((loan) => {
              const daysLeft = getDaysRemaining(loan.due_date);
              const isOverdue = daysLeft < 0;
              
              return (
                <div key={loan.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                  <div className="p-5 flex-1">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded">
                        {loan.book_item_barcode || loan.book_item_id}
                      </span>
                      {isOverdue ? (
                        <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded flex items-center gap-1">
                          <AlertTriangle size={12} /> Overdue
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded flex items-center gap-1">
                          <Clock size={12} /> {daysLeft} days left
                        </span>
                      )}
                    </div>
                    
                    {/* Note: In a real app, we'd join Book Table to get Title. 
                        For now, the ID is shown unless we update the backend serializer to include title. 
                        Assuming the user can physically look at the book in their hand. */}
                    <h3 className="font-bold text-lg text-gray-800 mb-1">
                      Loan #{loan.id}
                    </h3>
                    <p className="text-sm text-gray-500">
                      Due: {new Date(loan.due_date).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-between items-center">
                    <div className="text-xs text-gray-500">
                      Renewals: {loan.renewal_count || 0}/2
                    </div>
                    <button
                      onClick={() => handleRenew(loan.id)}
                      disabled={isOverdue || (loan.renewal_count >= 2)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <RefreshCw size={14} /> Renew
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* --- Section 2: Loan History --- */}
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <CheckCircle className="text-gray-400" /> History
        </h2>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-gray-900 border-b border-gray-200">
              <tr>
                <th className="p-4 font-semibold">Item Barcode</th>
                <th className="p-4 font-semibold">Borrowed</th>
                <th className="p-4 font-semibold">Returned</th>
                <th className="p-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {loans.past_loans.length === 0 ? (
                <tr>
                  <td colSpan="4" className="p-8 text-center text-gray-400">No history available</td>
                </tr>
              ) : (
                loans.past_loans.map((loan) => (
                  <tr key={loan.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-4 font-mono">{loan.book_item_barcode || loan.book_item_id}</td>
                    <td className="p-4">{new Date(loan.issue_date).toLocaleDateString()}</td>
                    <td className="p-4">{loan.return_date ? new Date(loan.return_date).toLocaleDateString() : '-'}</td>
                    <td className="p-4">
                      <span className="bg-gray-200 text-gray-700 px-2 py-1 rounded text-xs">
                        Returned
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}