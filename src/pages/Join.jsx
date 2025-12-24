import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { formatName } from '../utils/stringUtils';
import { Check, X } from 'lucide-react';

export default function Join() {
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get('g');
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [status, setStatus] = useState('checking'); // checking, exists, error, success, already_member, already_pending
  const [groupName, setGroupName] = useState('');

  useEffect(() => {
    async function checkGroup() {
      if (!groupId || !currentUser) {
        setStatus('error');
        return;
      }

      try {
        const groupRef = doc(db, "groups", groupId);
        const groupSnap = await getDoc(groupRef);

        if (!groupSnap.exists()) {
          setStatus('error');
          return;
        }

        const data = groupSnap.data();
        setGroupName(data.name);

        const isMember = (data.members || []).some(m => m.uid === currentUser.uid);
        if (isMember) {
          setStatus('already_member');
          return;
        }

        const pendingRef = doc(db, "users", currentUser.uid, "groups", groupId);
        const pendingSnap = await getDoc(pendingRef);
        if (pendingSnap.exists()) {
          setStatus('already_pending');
          return;
        }

        setStatus('exists');
      } catch (e) {
        console.error(e);
        setStatus('error');
      }
    }
    checkGroup();
  }, [groupId, currentUser]);

  const handleJoin = async () => {
    if (!currentUser || !groupId) return;
    try {
      // 1. Create User Pending Record
      await setDoc(doc(db, "users", currentUser.uid, "groups", groupId), {
        name: groupName,
        groupId,
        status: "pending",
        requesterName: formatName(currentUser.displayName || "Utente"),
      });

      // 2. Create Group Pending Record
      await setDoc(doc(db, "groups", groupId, "pendingTransactions", currentUser.uid), {
        status: "pending",
        requesterName: formatName(currentUser.displayName || "Utente"),
        photoURL: currentUser.photoURL || null, // Pass photo info
        timestamp: new Date()
      });

      setStatus('success');
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  };

  if (status === 'checking') return <div className="p-10 text-center">Verifica in corso...</div>;
  if (status === 'error') return <div className="p-10 text-center text-red-500">Errore: Gruppo non valido o link scaduto.</div>;
  if (status === 'already_member') {
    setTimeout(() => navigate('/dashboard'), 2000);
    return <div className="p-10 text-center text-green-600">Sei già membro! Reindirizzamento...</div>;
  }
  if (status === 'already_pending') {
    return (
      <div className="p-10 text-center bg-yellow-50 max-w-md mx-auto mt-10 rounded-xl shadow">
        <h2 className="text-xl font-bold mb-2">Richiesta già inviata!</h2>
        <p>Attendi che l'amministratore ti accetti.</p>
        <button onClick={() => navigate('/dashboard')} className="mt-4 text-blue-600 underline">Torna alla Dashboard</button>
      </div>
    );
  }
  if (status === 'success') {
     return (
      <div className="p-10 text-center bg-green-50 max-w-md mx-auto mt-10 rounded-xl shadow text-green-800">
        <Check size={48} className="mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Richiesta Inviata!</h2>
        <p>Attendi l'approvazione dell'amministratore.</p>
        <button onClick={() => navigate('/dashboard')} className="mt-4 text-green-700 underline font-bold">Torna alla Dashboard</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 bg-beer-gold rounded-full flex items-center justify-center mx-auto text-4xl shadow-md">
          🍺
        </div>
        <h1 className="text-2xl font-bold">Unisciti a "{groupName}"</h1>
        <p className="text-gray-500">
          Vuoi unirti a questo gruppo per tenere traccia delle birre?
        </p>
        <div className="flex gap-4 pt-4">
          <button 
            onClick={() => navigate('/dashboard')}
            className="flex-1 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
          >
            Annulla
          </button>
          <button 
            onClick={handleJoin}
            className="flex-1 py-3 bg-black text-white rounded-lg hover:bg-gray-800 font-bold shadow-lg"
          >
            Unisciti
          </button>
        </div>
      </div>
    </div>
  );
}
