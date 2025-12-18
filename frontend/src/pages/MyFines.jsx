import { useState, useEffect } from 'react';
import api from '../api';
import { AlertCircle, CheckCircle } from 'lucide-react';

export default function MyFines() {
  const [fines, setFines] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/my/fines')
      .then(res => setFines(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const totalDue = fines.reduce((sum, f) => sum + (f.amount - (f.amount_paid || 0)), 0);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Account Balance</h1>
        <div className={`px-4 py-2 rounded-lg font-bold text-lg ${totalDue > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          Total Due: ${totalDue.toFixed(2)}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {fines.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center text-gray-500">
            <div className="bg-green-100 p-4 rounded-full mb-4">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">All caught up!</h3>
            <p>You have no unpaid fines.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {fines.map(fine => (
              <div key={fine.id} className="p-6 flex items-start gap-4 hover:bg-gray-50 transition">
                <div className="mt-1">
                  <AlertCircle className="text-red-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-800">{fine.reason}</h3>
                  <p className="text-sm text-gray-500">Loan Reference: #{fine.loan_id}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Assessed on: {fine.created_at ? new Date(fine.created_at).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg text-red-600">
                    ${(fine.amount - (fine.amount_paid || 0)).toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-400">
                    of ${fine.amount} total
                  </div>
                  <div className="text-xs text-orange-600 font-medium mt-1">
                    {fine.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {totalDue > 0 && (
        <p className="text-center text-sm text-gray-500 mt-6 bg-yellow-50 p-3 rounded-lg border border-yellow-200">
          ⚠️ Please visit the Circulation Desk to pay outstanding fines. 
          Borrowing privileges may be suspended for debts over $10.00.
        </p>
      )}
    </div>
  );
}