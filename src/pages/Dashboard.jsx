import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, query, getDocs, addDoc, setDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { formatName } from '../utils/stringUtils';
import { LogOut, Plus, Users, Beer, Sparkles, X } from 'lucide-react';

export default function Dashboard() {
  const { currentUser, logout } = useAuth();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => {
    fetchGroups();
  }, [currentUser]);

  async function fetchGroups() {
    if (!currentUser) return;
    try {
      const q = query(collection(db, "users", currentUser.uid, "groups"));
      const querySnapshot = await getDocs(q);
      const groupData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setGroups(groupData);
    } catch (err) {
      console.error("Error fetching groups:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      // Create Group Doc
      const groupRef = await addDoc(collection(db, "groups"), {
        name: newGroupName,
        createdBy: currentUser.uid,
        createdAt: new Date(),
        members: [{ 
          uid: currentUser.uid, 
          role: "admin", 
          name: formatName(currentUser.displayName),
          photoURL: currentUser.photoURL // Store photoURL
        }],
        debts: []
      });

      // Link to User
      await setDoc(doc(db, "users", currentUser.uid, "groups", groupRef.id), { 
        name: newGroupName, 
        status: "admin", 
        groupId: groupRef.id 
      });

      setNewGroupName('');
      setShowCreateModal(false);
      fetchGroups();
    } catch (e) {
      console.error("Error creating group:", e);
      alert("Errore nella creazione del gruppo");
    }
  };

  return (
    <div className="min-h-screen pb-20">
      
      {/* Navbar */}
      <nav className="glass sticky top-0 z-20 px-6 py-4 flex justify-between items-center mb-8">
        <h1 className="text-2xl font-black italic flex items-center gap-2 text-gray-900">
           <span className="text-3xl animate-wiggle">🍺</span> Beercounter
        </h1>
        <div className="flex items-center gap-4">
           {currentUser?.photoURL ? (
             <img src={currentUser.photoURL} alt="User" className="w-10 h-10 rounded-full border-2 border-beer-gold" />
           ) : (
             <div className="w-10 h-10 bg-beer-gold rounded-full flex items-center justify-center font-bold text-lg">
               {currentUser?.displayName?.[0]}
             </div>
           )}
           <button onClick={logout} className="p-2 rounded-full hover:bg-red-50 text-gray-500 hover:text-red-500 transition-colors">
             <LogOut size={20} />
           </button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4">
        
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-beer-amber to-beer-gold p-8 rounded-3xl shadow-xl mb-12 text-white relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-8 opacity-10 transform translate-x-10 -translate-y-10 group-hover:scale-110 transition-transform duration-700">
             <Beer size={200} />
           </div>
           <h2 className="text-3xl font-bold mb-2">Ciao, {formatName(currentUser?.displayName?.split(' ')[0])}! 👋</h2>
           <p className="text-beer-brown font-medium max-w-md">Pronto a saldare i conti o a crearne di nuovi? La sete non aspetta!</p>
           
           <button 
             onClick={() => setShowCreateModal(true)}
             className="mt-6 bg-beer-dark text-white px-6 py-3 rounded-xl font-bold shadow-lg flex items-center gap-2 hover:bg-black transform hover:-translate-y-1 transition-all"
           >
             <Plus size={20} /> Crea un nuovo gruppo
           </button>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <h3 className="text-2xl font-bold text-gray-800">I tuoi Gruppi</h3>
          <span className="bg-beer-gold text-xs font-bold px-2 py-1 rounded-full text-black">{groups.length}</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
            {[1,2,3].map(i => <div key={i} className="h-40 bg-gray-200 rounded-2xl"></div>)}
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-20 glass rounded-3xl border-2 border-dashed border-gray-300">
            <div className="mb-4 inline-block p-4 bg-gray-100 rounded-full">
               <Users size={48} className="text-gray-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-600 mb-2">Deserto totale... 🏜️</h3>
            <p className="text-gray-500 mb-6">Non sei ancora in nessun gruppo.</p>
            <p className="text-sm text-beer-amber font-bold animate-bounce cursor-pointer" onClick={() => setShowCreateModal(true)}>
              Crea un gruppo o fatti invitare per iniziare!
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {groups.map((group, idx) => (
              <div 
                key={group.id} 
                className="group relative bg-white p-6 rounded-3xl shadow-md hover:shadow-2xl border-2 border-beer-foam hover:border-beer-gold transition-all duration-300 cursor-pointer overflow-hidden animate-slide-up"
                style={{ animationDelay: `${idx * 100}ms` }}
                onClick={() => window.location.href = `/group/${group.id}`}
              >
                {/* Background Image if available */}
                {group.photoURL && (
                  <div className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity">
                    <img src={group.photoURL} alt="" className="w-full h-full object-cover" />
                  </div>
                )}

                {/* Foam Effect (only if no photo, or overlay) */}
                {!group.photoURL && <div className="absolute top-0 right-0 w-20 h-20 bg-white opacity-40 rounded-bl-full"></div>}
                
                <div className="flex justify-between items-start mb-4 relative z-10">
                   <div className="p-3 bg-white/60 rounded-2xl group-hover:bg-beer-gold group-hover:text-black transition-colors duration-300 text-beer-amber">
                      <Users size={24} />
                   </div>
                   {group.status === 'admin' && (
                     <span className="bg-green-100/80 text-green-700 text-xs font-bold px-2 py-1 rounded-full border border-green-200 flex items-center gap-1">
                        <Sparkles size={10} /> Admin
                     </span>
                   )}
                </div>

                <h3 className="text-xl font-bold text-gray-800 mb-1 group-hover:text-amber-700 transition-colors">{group.name}</h3>
                
                <p className={`text-sm font-medium ${
                  group.status === 'pending' ? 'text-amber-500' : 'text-gray-400'
                }`}>
                  {group.status === 'pending' ? '⏳ In attesa di approvazione' : 'Membro attivo'}
                </p>

                <div className="mt-6 pt-4 border-t border-orange-100/50 flex justify-end items-center">
                  <span className="text-beer-amber font-bold text-sm group-hover:translate-x-1 transition-transform">Entra →</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

       {/* Create Group Modal */}
       {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="bg-beer-gold p-6 relative">
              <h3 className="text-xl font-black text-center">NUOVO GRUPPO 🍻</h3>
              <button 
                 onClick={() => setShowCreateModal(false)}
                 className="absolute right-4 top-4 hover:bg-black/10 rounded-full p-1 transition-colors"
              >
                 <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-1">Nome del Gruppo</label>
                <input 
                  autoFocus
                  type="text" 
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Es. Birrette del Giovedì"
                  className="w-full p-3 bg-gray-50 border-2 border-gray-200 rounded-xl font-bold focus:border-beer-gold outline-none transition-colors"
                />
              </div>
              <button 
                onClick={handleCreateGroup}
                className="w-full py-3 bg-black text-white font-bold rounded-xl shadow-lg hover:bg-gray-800 transform active:scale-95 transition-all"
              >
                Crea Gruppo
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
