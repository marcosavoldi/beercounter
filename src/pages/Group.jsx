import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, addDoc, collection, query, orderBy, limit, getDocs, deleteDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { formatName, getInitials } from '../utils/stringUtils';
import { ArrowLeft, Plus, History, Trash2, UserMinus, Crown, Wallet, PartyPopper, User, Camera, Users, Check, X, Bell, FileText, Edit2, Save, Beer, LogOut, RefreshCw } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';

export default function Group() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [actingUser, setActingUser] = useState('');
  const [transType, setTransType] = useState('deve'); // 'deve' or 'ha_pagato'
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  
  // Debt Detail Modal
  const [selectedDebtDetail, setSelectedDebtDetail] = useState(null);
  
  // Rules State
  const [rulesText, setRulesText] = useState('');
  const [isEditingRules, setIsEditingRules] = useState(false);

  useEffect(() => {
    fetchGroup();
    fetchHistory();
    fetchPendingRequests();
  }, [groupId]);

  useEffect(() => {
     if (group) {
        checkOldDebts(group);
     }
  }, [group?.id]); // specific dependency to run once per group load


  async function fetchGroup() {
    if (!groupId) return;
    try {
      const docRef = doc(db, "groups", groupId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setGroup({ id: docSnap.id, ...data });
        // Set default acting user to current user
        const me = data.members?.find(m => m.uid === currentUser?.uid);
        if (me) setActingUser(me.uid);
        
        // Init rules
        setRulesText(data.rules || '');
      } else {
        // Self-Healing: If group doesn't exist, remove it from user's list
        console.log("Group not found. Cleaning up reference...");
        if (currentUser) {
            await deleteDoc(doc(db, "users", currentUser.uid, "groups", groupId));
            alert("Il gruppo non esiste più. È stato rimosso dalla tua lista.");
        }
        navigate('/dashboard');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchHistory() {
    try {
      const q = query(collection(db, "groups", groupId, "history"), orderBy("timestamp", "desc"), limit(10));
      const snap = await getDocs(q);
      setHistory(snap.docs.map(d => d.data()));
    } catch (e) { console.error(e); }
  }

  async function fetchPendingRequests() {
    try {
      const q = query(collection(db, "groups", groupId, "pendingTransactions"));
      const snap = await getDocs(q);
      setPendingRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  }

  const handleApproveMember = async (req) => {
    try {
      // 1. Add to Group Members
      const newMember = {
        uid: req.id, // pending doc ID is usually uid for joins? Check Join.jsx logic. Yes setDoc(..., currentUser.uid)
        name: req.requesterName,
        photoURL: req.photoURL || null,
        role: 'member',
        saldoBirre: 0
      };
      const newMembers = [...group.members, newMember];
      await updateDoc(doc(db, "groups", groupId), { members: newMembers });

      // 2. Update User Status
      await updateDoc(doc(db, "users", req.id, "groups", groupId), { status: "active" });

      // 3. Delete Request
      await deleteDoc(doc(db, "groups", groupId, "pendingTransactions", req.id));
      
      // 4. Refresh
      fetchGroup();
      fetchPendingRequests();
      alert(`Benvenuto a bordo, ${req.requesterName}! 🍻`);
    } catch (e) { console.error(e); }
  };

  const handleApproveTransaction = async (req) => {
    try {
      const actingMember = group.members.find(m => m.uid === req.actingUser);
      const recipientsMembers = group.members.filter(m => req.recipients.includes(m.uid));
      
      if (!actingMember) return alert("Utente non trovato nel gruppo");

      // Use the existing logic function but adapted needed context variables
      // Re-implementing logic here for safety or refactoring 'processTransactionImmediate' to be reusable?
      // Let's reuse 'processTransactionImmediate' logic but we need to pass the right params.
      // Need to temporarily set 'transType' state or pass it? The function uses 'transType' from state. 
      // Better to Refactor 'processTransactionImmediate' to accept 'type' as arg.
      
      // Refactored Logic Inline for safety:
      const type = req.transType; 
      
      // Update Members Saldo
      const newMembers = group.members.map(m => {
        let copy = { ...m };
        if (m.uid === actingMember.uid) {
          const delta = type === 'deve' ? recipientsMembers.length : -recipientsMembers.length;
          copy.saldoBirre = (copy.saldoBirre || 0) + delta;
        }
        return copy;
      });

      // Update Debts
      let newDebts = [...(group.debts || [])];
      recipientsMembers.forEach(cred => {
        const idx = newDebts.findIndex(d => d.debtorUid === actingMember.uid && d.creditorUid === cred.uid);
        const delta = type === 'deve' ? 1 : -1;
        
        if (idx >= 0) {
          newDebts[idx].count += delta;
          if (newDebts[idx].count <= 0) newDebts.splice(idx, 1);
        } else if (delta > 0) {
          newDebts.push({
            debtorUid: actingMember.uid, 
            debtorName: actingMember.name, 
            creditorUid: cred.uid, 
            creditorName: cred.name, 
            count: 1,
            createdAt: new Date() // Track creation
          });
        }
      });

      await updateDoc(doc(db, "groups", groupId), { members: newMembers, debts: newDebts });
      await addDoc(collection(db, "groups", groupId, "history"), { message: req.message, timestamp: new Date() });
      
      // --- NOTIFICATIONS (Approve path) ---
      try {
        const batch = [];
        recipientsMembers.forEach(recip => {
           if (recip.uid === actingMember.uid) return;
           batch.push(addDoc(collection(db, "users", recip.uid, "notifications"), {
              type: type === 'deve' ? 'new_debt' : 'settled',
              message: type === 'deve' 
                 ? `🍺 ${formatName(actingMember.name)} ti ha segnato una birra!` 
                 : `✅ ${formatName(actingMember.name)} ha saldato il debito!`,
              read: false,
              timestamp: new Date(),
              link: `/group/${groupId}`,
              groupId: groupId
           }));
        });
        await Promise.all(batch);
      } catch(e) { console.error("Error sending notifications:", e); }

      // Delete Request
      await deleteDoc(doc(db, "groups", groupId, "pendingTransactions", req.id));

      fetchGroup();
      fetchHistory();
      fetchPendingRequests();
    } catch (e) { console.error(e); }
  };

  const handleRejectRequest = async (req) => {
    if (!confirm("Rifiutare questa richiesta?")) return;
    try {
      await deleteDoc(doc(db, "groups", groupId, "pendingTransactions", req.id));
      if (req.type === 'join') {
         // Optionally remove the pending status from user doc? 
         // For now just deleting the group request is enough to block them.
         await deleteDoc(doc(db, "users", req.id, "groups", groupId));
      }
      fetchPendingRequests();
    } catch (e) { console.error(e); }
  };

  const handleToggleRecipient = (uid) => {
    setSelectedRecipients(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const handleRemoveMember = async (memberUid) => {
    if (!window.confirm("Rimuovere questo membro?")) return;
    try {
      const newMembers = group.members.filter(m => m.uid !== memberUid);
      await updateDoc(doc(db, "groups", groupId), { members: newMembers });
      await deleteDoc(doc(db, "users", memberUid, "groups", groupId));
      fetchGroup();
    } catch (e) { console.error(e); }
  };

  const handleDeleteGroup = async () => {
    if (!window.confirm("ELIMINARE IL GRUPPO? Questa azione è irreversibile.")) return;
    try {
        // 1. Try to remove references from all members
        // We use allSettled because we might not have permission to write to other users' collections
        const cleanupPromises = group.members.map(member => 
            deleteDoc(doc(db, "users", member.uid, "groups", groupId))
        );
        
        await Promise.allSettled(cleanupPromises);

       // 2. Delete the group document (This is the most important)
       await deleteDoc(doc(db, "groups", groupId));
       
       alert("Gruppo eliminato correttamente.");
       navigate('/dashboard');
    } catch(e) { 
        console.error("Deletion error:", e);
        // Even if something failed, force navigate if the main group is likely gone or we want to exit
        alert("Potrebbe esserci stato un errore durante la pulizia, ma il gruppo è stato eliminato.");
        navigate('/dashboard');
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const storageRef = ref(storage, `group_images/${groupId}_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      await updateDoc(doc(db, "groups", groupId), { photoURL: url });
      
      // Update local state immediately
      setGroup(prev => ({ ...prev, photoURL: url }));
      alert("Immagine del gruppo aggiornata! 📸");
    } catch (error) {
      console.error("Error uploading image:", error);
      alert("Errore nel caricamento dell'immagine.");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveRules = async () => {
    try {
      await updateDoc(doc(db, "groups", groupId), { rules: rulesText });
      setGroup(prev => ({ ...prev, rules: rulesText }));
      setIsEditingRules(false);
      alert("Regole aggiornate! 📜");
    } catch (e) {
      console.error("Error saving rules:", e);
      alert("Errore nel salvataggio delle regole.");
    }
  };

  const handleRecalculateBalances = async () => {
    if (!confirm("Ricalcolare i saldi birre di TUTTI i membri basandosi sui debiti attuali? \nUtile se i conti non tornano.")) return;
    
    try {
        const debts = group.debts || [];
        const newMembers = group.members.map(m => {
            // Calculate debts (positive) - what I owe
            const debtsCount = debts
                .filter(d => d.debtorUid === m.uid)
                .reduce((sum, d) => sum + d.count, 0);
            
            // Calculate credits (negative logic in previous implementation?)
            // Wait, previous logic was:
            // "DEVE OFFRIRE" (Debtor) -> Postive Saldo (+1)
            // "CREDITORE" (Creditor) -> Negative Saldo (-1)
            
            const creditsCount = debts
                .filter(d => d.creditorUid === m.uid)
                .reduce((sum, d) => sum + d.count, 0);
            
            return {
                ...m,
                saldoBirre: debtsCount - creditsCount
            };
        });

        await updateDoc(doc(db, "groups", groupId), { members: newMembers });
        
        // Log it
         await addDoc(collection(db, "groups", groupId, "history"), { 
            message: `🔧 L'admin ha ricalcolato e sincronizzato i saldi di tutti i membri.`, 
            timestamp: new Date()
         });

        alert("Saldi ricalcolati e corretti! ✅");
        fetchGroup();
        fetchHistory();

    } catch(e) {
        console.error("Recalc Error", e);
        alert("Errore durante il ricalcolo.");
    }
  };

  const handleAdminDeleteDebt = async (debtorName, targetCreditorUid, targetCreditorName, rawDebtorUid) => {
    if (!confirm(`Rimuovere 1 birra dal debito verso ${targetCreditorName}?`)) return;
    
    try {
        const newDebts = [...(group.debts || [])];
        const targetIdx = newDebts.findIndex(d => 
            d.debtorUid === rawDebtorUid && 
            d.creditorUid === targetCreditorUid
        );
        
        if (targetIdx >= 0) {
            // 1. Update Debts
            newDebts[targetIdx].count -= 1;
            if (newDebts[targetIdx].count <= 0) {
                newDebts.splice(targetIdx, 1);
            }
            
            // 2. Update Members Balance (Debtor Only to match current logic)
            // Note: Current app logic (add/settle) only updates the actor's balance. 
            // To maintain consistency and avoid data corruption (e.g. creating false debts for creditors who started at 0),
            // we only update the debtor here.
            const newMembers = group.members.map(m => {
                if (m.uid === rawDebtorUid) {
                    return { ...m, saldoBirre: (m.saldoBirre || 0) - 1 };
                }
                return m;
            });

            // 3. Commit
            await updateDoc(doc(db, "groups", groupId), { 
                members: newMembers,
                debts: newDebts 
            });
            
            // 4. History
            await addDoc(collection(db, "groups", groupId, "history"), { 
                message: `L'amministratore del gruppo ha eliminato il debito di una birra di ${debtorName} nei confronti di ${targetCreditorName}`, 
                timestamp: new Date() 
            });

            alert("Birra rimossa! 🍺💨");
            
            // 5. Refresh
            fetchGroup(); 
            fetchHistory();
            
            // Check if debt still exists for UI
            const remaining = newDebts.find(d => d.debtorUid === rawDebtorUid && d.creditorUid === targetCreditorUid);
            if (!remaining || remaining.count <= 0) {
                 // Close modal or refresh detail? For now, we update the detail view if simple, 
                 // but since we fetchGroup, closing might be safer or we need to update selectedDebtDetail state locally.
                 // Let's close it to be safe/simple.
                 setSelectedDebtDetail(null);
            } else {
                 // Update the local detail view manually to reflect change without closing
                 setSelectedDebtDetail(prev => ({
                    ...prev,
                    details: prev.details.map(d => 
                        d.creditorUid === targetCreditorUid ? { ...d, count: d.count - 1 } : d
                    ).filter(d => d.count > 0)
                 }));
            }
        }
    } catch(e) { 
        console.error(e); 
        alert("Errore durante la rimozione"); 
    }
  };

  const handleSubmitTransaction = async () => {
    if (!selectedRecipients.length) return alert("Seleziona i destinatari");
    if (!actingUser) return alert("Seleziona chi paga/deve");
    
    // Safety check for self-debt
    if (selectedRecipients.includes(actingUser)) {
        alert("Non puoi avere debiti con te stesso! Seleziona qualcun altro.");
        setSelectedRecipients(prev => prev.filter(id => id !== actingUser));
        return;
    }

    const actingMember = group.members.find(m => m.uid === actingUser);
    const recipientsMembers = group.members.filter(m => selectedRecipients.includes(m.uid));
    const recipientsNames = recipientsMembers.map(m => formatName(m.name)).join(", ");
    const count = selectedRecipients.length;

    let message = "";
    const quantityTxt = count === 1 ? "una birra" : `${count} birre`;

    const actorName = formatName(actingMember.name);

    if (transType === 'deve') {
      message = `🍺 NUOVO GIRO! ${actorName} deve ${quantityTxt} a ${recipientsNames}.`;
    } else {
      message = `💸 CONTO SALDATO: ${actorName} ha pagato ${quantityTxt} a ${recipientsNames}.`;
    }

    const isAdmin = group.members.find(m => m.uid === currentUser.uid)?.role === 'admin';

    if (isAdmin) {
      await processTransactionImmediate(actingMember, recipientsMembers, message);
    } else {
      await processTransactionPending(actingMember, recipientsMembers, message);
    }
    
    setShowModal(false);
    setSelectedRecipients([]);
  };

  async function processTransactionImmediate(actingMember, recipientsMembers, message) {
    const newMembers = group.members.map(m => {
      let copy = { ...m };
      if (m.uid === actingMember.uid) {
        const delta = transType === 'deve' ? recipientsMembers.length : -recipientsMembers.length;
        copy.saldoBirre = (copy.saldoBirre || 0) + delta;
      }
      return copy;
    });

    let newDebts = [...(group.debts || [])];
    recipientsMembers.forEach(cred => {
      const idx = newDebts.findIndex(d => d.debtorUid === actingMember.uid && d.creditorUid === cred.uid);
      const delta = transType === 'deve' ? 1 : -1;
      
      if (idx >= 0) {
        newDebts[idx].count += delta;
        if (newDebts[idx].count <= 0) newDebts.splice(idx, 1);
      } else if (delta > 0) {
        newDebts.push({ 
          debtorUid: actingMember.uid, 
          debtorName: actingMember.name, 
          creditorUid: cred.uid, 
          creditorName: cred.name, 
          count: 1,
          createdAt: new Date() // Track creation for Old Debt logic
        });
      }
    });

    await updateDoc(doc(db, "groups", groupId), { members: newMembers, debts: newDebts });
    await addDoc(collection(db, "groups", groupId, "history"), { message, timestamp: new Date() });
    
    // --- NOTIFICATIONS ---
    try {
       const batch = [];
       // Notify recipients
       recipientsMembers.forEach(recip => {
           if (recip.uid === actingMember.uid) return; // Should not happen but safety first
           
           const notifRef = collection(db, "users", recip.uid, "notifications");
           const notifData = {
              type: transType === 'deve' ? 'new_debt' : 'settled',
              message: transType === 'deve' 
                 ? `🍺 ${formatName(actingMember.name)} ti ha segnato una birra!` 
                 : `✅ ${formatName(actingMember.name)} ha saldato il debito!`,
              read: false,
              timestamp: new Date(),
              link: `/group/${groupId}`,
              groupId: groupId
           };
           batch.push(addDoc(notifRef, notifData));
       });
       await Promise.all(batch);
    } catch(e) { console.error("Error sending notifications:", e); }

    fetchGroup();
    fetchHistory();
  }

  // ---- GHOST CHECK (Old Debt Shame) ----
  const checkOldDebts = async (currentGroup) => {
     if (!currentGroup || !currentGroup.debts) return;
     
     // Only run if we haven't checked recently to avoid spam (client-side simple debounce could go here, 
     // but we rely on 'lastShamedAt' in DB)
     
     const now = new Date();
     const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
     const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
     
     let shameFound = false;
     let updatedDebts = [...currentGroup.debts];

     for (let i = 0; i < updatedDebts.length; i++) {
        const debt = updatedDebts[i];
        
        // Ensure createdAt exists (legacy support)
        const createdAt = debt.createdAt ? (debt.createdAt.toDate ? debt.createdAt.toDate() : new Date(debt.createdAt)) : new Date(); 
        // If legacy debt has no date, we assume it's new-ish or we can't shame it yet. 
        // Realistically we should migrate data but for now we skip invalid dates.
        
        const timeDiff = now - createdAt;
        
        if (timeDiff > THIRTY_DAYS_MS) {
            // Check if already shamed recently
            const lastShamedAt = debt.lastShamedAt ? (debt.lastShamedAt.toDate ? debt.lastShamedAt.toDate() : new Date(debt.lastShamedAt)) : null;
            
            if (!lastShamedAt || (now - lastShamedAt) > SEVEN_DAYS_MS) {
               // IT'S SHAME TIME! 🔔
               shameFound = true;
               updatedDebts[i].lastShamedAt = now;
               
               const shameMsg = `🕸️ RAGNATELE! ${formatName(debt.debtorName)} deve a ${formatName(debt.creditorName)} da 30 giorni! Paga!`;
               
               // 1. Add History Shame
               addDoc(collection(db, "groups", groupId, "history"), { 
                  message: shameMsg, 
                  timestamp: now,
                  type: 'shame'
               });

               // 2. Broadcast Notification to ALL members
               currentGroup.members.forEach(m => {
                  addDoc(collection(db, "users", m.uid, "notifications"), {
                      type: 'shame',
                      message: shameMsg,
                      read: false,
                      timestamp: now,
                      link: `/group/${groupId}`,
                      groupId: groupId
                  });
               });
            }
        }
     }

     if (shameFound) {
        await updateDoc(doc(db, "groups", groupId), { debts: updatedDebts });
     }
  };

  async function processTransactionPending(actingMember, recipientsMembers, message) {
    await addDoc(collection(db, "groups", groupId, "pendingTransactions"), {
      actingUser: actingMember.uid,
      actingUserName: actingMember.name,
      transType,
      recipients: recipientsMembers.map(r => r.uid),
      count: recipientsMembers.length,
      message,
      type: 'transaction',
      recipientsNames, // Store names for display
      timestamp: new Date(),
      status: "pending"
    });
    alert("📢 Richiesta inviata! L'admin dovrà approvare.");
  }

  // ---- Logic helpers ----

  const isAdmin = group?.members?.find(m => m.uid === currentUser?.uid)?.role === 'admin';
  
  // Consolidate Debts Logic
  const consolidatedDebts = React.useMemo(() => {
    if (!group?.debts) return [];
    const grouped = {};
    group.debts.forEach(d => {
      if (!grouped[d.debtorUid]) {
        grouped[d.debtorUid] = {
           debtorName: formatName(d.debtorName),
           total: 0,
           details: [],
           rawDebtorUid: d.debtorUid, // Needed for deletion logic
        };
      }
      grouped[d.debtorUid].total += d.count;
      grouped[d.debtorUid].details.push({ 
        to: formatName(d.creditorName), 
        count: d.count,
        creditorUid: d.creditorUid, // Needed for deletion
        creditorName: d.creditorName
      });
    });
    return Object.values(grouped).sort((a,b) => b.total - a.total);
  }, [group?.debts]);

  if (loading) return <div className="p-8 text-center text-gray-500 animate-pulse">🍺 Riempimento boccali in corso...</div>;
  if (!group) return null;

  return (
    <div className="min-h-screen bg-amber-50 p-4 pb-20">
      
      {/* Top Bar - Adjusted layout for better wrapping */}
      <div className="max-w-3xl mx-auto flex flex-row items-center justify-between mb-8 gap-4">
        <div className="flex-1 min-w-0 flex items-center gap-4">
           <button onClick={() => navigate('/dashboard')} className="p-2 bg-white rounded-full shadow-md text-gray-600 hover:text-black shrink-0">
             <ArrowLeft size={24} />
           </button>
           <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-orange-600 to-amber-600 drop-shadow-sm truncate">
             {group.name}
           </h1>
        </div>
        
        <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                const inviteLink = `${window.location.origin}/join?g=${group.id}`;
                 if (navigator.share) {
                   navigator.share({
                     title: `Unisciti a ${group.name} su BeerCounter!`,
                     text: 'Vieni a pagare le tue birre (o a fartele offrire)! 🍺',
                     url: inviteLink,
                   }).catch(console.error);
                 } else {
                   navigator.clipboard.writeText(inviteLink);
                   alert("Link di invito copiato! 🔗\nInvialo ai tuoi amici.");
                 }
              }}
              className="px-4 py-2 bg-beer-gold text-black rounded-full font-bold shadow-md hover:bg-yellow-400 transition-transform hover:scale-105 flex items-center gap-2 text-sm"
            >
              <Users size={18} /> Invita
            </button>
            
            {isAdmin && (
              <button onClick={handleDeleteGroup} className="px-4 py-2 bg-red-100 rounded-full text-red-500 hover:bg-red-200 transition-colors text-sm font-bold flex items-center gap-2 shrink-0">
                <Trash2 size={16} />
              </button>
            )}

           {/* Notification Bell */}
           <div className="relative">
             <button 
               onClick={() => setShowNotifDrawer(!showNotifDrawer)}
               className="p-2 rounded-full bg-amber-100 text-amber-700 shadow-sm hover:bg-amber-200 transition-colors relative"
             >
               <Bell size={24} />
               {unreadCount > 0 && (
                 <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold flex items-center justify-center rounded-full animate-pulse border-2 border-white">
                   {unreadCount}
                 </span>
               )}
             </button>

             {/* Notification Drawer */}
             {showNotifDrawer && (
               <div className="absolute top-full right-0 mt-2 w-[85vw] max-w-xs sm:w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-40 animate-in fade-in slide-in-from-top-2">
                 <div className="p-4 bg-beer-gold/10 border-b border-beer-gold/20 flex justify-between items-center">
                   <h3 className="font-bold text-gray-800">Notifiche</h3>
                   {unreadCount > 0 && (
                     <button onClick={markAllAsRead} className="text-xs font-bold text-beer-dark hover:underline">
                       Segna lette
                     </button>
                   )}
                 </div>
                 <div className="max-h-80 overflow-y-auto">
                   {notifications.length === 0 ? (
                     <div className="p-8 text-center text-gray-400 text-sm">
                       Nessuna novità... tutto tace 🤫
                     </div>
                   ) : (
                     <div className="divide-y divide-gray-50">
                       {notifications.map(note => (
                         <div 
                           key={note.id} 
                           onClick={() => {
                             if (!note.read) markAsRead(note.id);
                             if (note.link) window.location.href = note.link;
                           }}
                           className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${!note.read ? 'bg-blue-50/50' : ''}`}
                         >
                           <div className="flex gap-3">
                             <div className="text-2xl shrink-0">
                               {note.type === 'shame' ? '🕸️' : note.type === 'new_debt' ? '🍺' : '✅'}
                             </div>
                             <div>
                               <p className={`text-sm text-left ${!note.read ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
                                 {note.message}
                               </p>
                               <p className="text-xs text-left text-gray-400 mt-1">
                                 {note.timestamp?.seconds ? new Date(note.timestamp.seconds * 1000).toLocaleDateString() : 'Ora'}
                               </p>
                             </div>
                           </div>
                         </div>
                       ))}
                     </div>
                   )}
                 </div>
               </div>
             )}
           </div>
        </div>

      {/* ADMIN PANEL - PENDING REQUESTS */}
      {isAdmin && pendingRequests.length > 0 && (
        <div className="max-w-3xl mx-auto mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
           <div className="bg-white border-2 border-orange-400 rounded-3xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-orange-400 animate-pulse"></div>
              
              <h3 className="text-xl font-black text-orange-600 mb-4 flex items-center gap-2">
                 <Bell className="animate-bounce" /> RICHIESTE IN SOSPESO
              </h3>

              <div className="space-y-3">
                 {pendingRequests.map(req => (
                    <div key={req.id} className="flex flex-col sm:flex-row items-center justify-between bg-orange-50 p-4 rounded-xl border border-orange-100 gap-4">
                       
                        {/* Request Info */}
                        <div className="flex items-start gap-3 w-full min-w-0">
                           {/* Icon based on type */}
                           <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0 ${req.type === 'transaction' ? 'bg-blue-500' : 'bg-green-500'}`}>
                              {req.type === 'transaction' ? 'Tx' : <User size={18} />}
                           </div>
                           
                           <div className="flex-1 min-w-0">
                              {req.type === 'transaction' ? (
                                 <div className="space-y-1">
                                     <div className="flex flex-col">
                                        <span className="text-xs text-gray-500 uppercase font-bold">Chi Deve Pagare:</span>
                                        <span className="font-bold text-gray-800 break-words">{req.transType === 'deve' ? req.actingUserName : req.recipientsNames}</span>
                                     </div>
                                     <div className="flex flex-col">
                                        <span className="text-xs text-gray-500 uppercase font-bold">A Chi:</span>
                                        <span className="font-bold text-gray-800 break-words">{req.transType === 'deve' ? req.recipientsNames : req.actingUserName}</span>
                                     </div>
                                     <div className="flex flex-col">
                                        <span className="text-xs text-gray-500 uppercase font-bold">Quando:</span>
                                        <span className="text-xs text-gray-600 font-mono">{new Date(req.timestamp?.seconds * 1000).toLocaleString()}</span>
                                     </div>
                                     <div className="mt-1 pt-1 border-t border-orange-200">
                                        <span className="text-xs italic text-gray-500 break-words">"{req.message}"</span>
                                     </div>
                                 </div>
                              ) : (
                                 <>
                                    <p className="font-bold text-gray-800 break-words">Richiesta di accesso: {req.requesterName}</p>
                                    <p className="text-xs text-gray-500 break-words">Vuole unirsi al gruppo</p>
                                    <p className="text-xs text-gray-400 mt-1">{new Date(req.timestamp?.seconds * 1000).toLocaleString()}</p>
                                 </>
                              )}
                           </div>
                        </div>

                       {/* Actions */}
                       <div className="flex sm:flex-col md:flex-row items-center gap-2 shrink-0 self-end sm:self-center w-full sm:w-auto justify-end">
                          <button 
                             onClick={() => req.type === 'transaction' ? handleApproveTransaction(req) : handleApproveMember(req)}
                             className="flex-1 sm:flex-none p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 shadow-md transition-colors flex justify-center"
                             title="Approva"
                          >
                             <Check size={20} />
                          </button>
                          <button 
                             onClick={() => handleRejectRequest(req)}
                             className="flex-1 sm:flex-none p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 shadow-md transition-colors flex justify-center"
                             title="Rifiuta"
                          >
                             <X size={20} />
                          </button>
                       </div>

                    </div>
                 ))}
              </div>
           </div>
        </div>
      )}
      </div>

      <div className="max-w-3xl mx-auto space-y-8">

        {/* Header/Image Section - REDESIGNED */}
        <div className="relative rounded-3xl p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white shadow-xl flex items-center justify-between gap-4 overflow-hidden">
           {/* Background Deco */}
           <div className="absolute top-0 right-0 w-64 h-64 bg-beer-gold/10 rounded-full blur-3xl transform translate-x-32 -translate-y-32 pointer-events-none"></div>

           <div className="relative z-10 flex-1">
              <h2 className="text-3xl md:text-4xl font-black text-white drop-shadow-md leading-tight mb-2">{group.name}</h2>
              <div className="text-gray-300 font-medium text-sm flex items-center gap-2">
                 <div className="flex -space-x-2">
                    {group.members?.slice(0,3).map((m,i) => (
                      <div key={i} className="w-6 h-6 rounded-full bg-gray-700 border border-gray-800 flex items-center justify-center text-[10px] text-white">
                        {m.photoURL && m.photoURL.length > 5 ? (
                          <img src={m.photoURL} className="w-full h-full rounded-full object-cover" onError={(e) => e.target.style.display = 'none'} />
                        ) : (
                          <span>{getInitials(m.name)}</span>
                        )}
                      </div>
                    ))}
                    {group.members?.length > 3 && <div className="w-6 h-6 rounded-full bg-gray-700 border border-gray-800 flex items-center justify-center text-[10px] text-white">+{group.members.length-3}</div>}
                 </div>
                 <span>{group.members?.length} membri</span>
              </div>
           </div>

           {/* Circle Avatar */}
           <div className="relative shrink-0">
             <div 
               onClick={() => group.photoURL && setShowImagePreview(true)}
               className={`w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-beer-gold/50 shadow-2xl overflow-hidden bg-gray-800 flex items-center justify-center relative group cursor-pointer transition-transform hover:scale-105 ${!group.photoURL ? 'cursor-default' : ''}`}
             >
                {group.photoURL ? (
                   <img src={group.photoURL} alt={group.name} className="w-full h-full object-cover" />
                ) : (
                   <span className="text-5xl">🍻</span>
                )}
                {group.photoURL && (
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-xs font-bold text-white">Vedi</span>
                  </div>
                )}
             </div>

            {/* Admin Upload Button (Floating near avatar) */}
             {isAdmin && (
               <label className="absolute bottom-0 right-0 bg-white text-black p-2 rounded-full cursor-pointer shadow-lg hover:bg-beer-gold transition-colors z-20">
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={uploading} />
                  <Camera size={18} />
               </label>
             )}
           </div>
        </div>

        {/* RULES OF THE GAME SECTION */}
        <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden relative">
           <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-black text-gray-700 flex items-center gap-2">
                 <FileText size={20} className="text-beer-amber" /> REGOLE DEL GIOCO
              </h3>
              <div className="flex gap-2">
                 {isAdmin && (
                    <button 
                      onClick={handleRecalculateBalances}
                      className="text-gray-400 hover:text-blue-500 transition-colors"
                      title="Ricalcola Saldi (Fix Bug)"
                    >
                       <RefreshCw size={18} />
                    </button>
                 )}
                 {isAdmin && !isEditingRules && (
                    <button onClick={() => setIsEditingRules(true)} className="text-gray-400 hover:text-black transition-colors">
                       <Edit2 size={18} />
                    </button>
                 )}
              </div>
           </div>
           
           <div className="p-6">
              {isEditingRules ? (
                <div className="space-y-4 animate-in fade-in">
                   <textarea 
                     value={rulesText}
                     onChange={(e) => setRulesText(e.target.value)}
                     className="w-full p-4 bg-yellow-50 border-2 border-yellow-200 rounded-xl focus:border-beer-gold outline-none min-h-[150px] font-medium text-gray-700 placeholder-gray-400"
                     placeholder="Scrivi qui le regole... (es. Chi arriva ultimo paga il primo giro)"
                   />
                   <div className="flex justify-end gap-2">
                      <button onClick={() => { setIsEditingRules(false); setRulesText(group.rules || ''); }} className="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg">
                        Annulla
                      </button>
                      <button onClick={handleSaveRules} className="px-6 py-2 bg-black text-white font-bold rounded-lg hover:bg-gray-800 flex items-center gap-2">
                        <Save size={18} /> Salva Regole
                      </button>
                   </div>
                </div>
              ) : (
                <div className="prose prose-sm max-w-none text-gray-600">
                   {group.rules ? (
                     <p className="whitespace-pre-line leading-relaxed italic border-l-4 border-beer-gold pl-4 py-1">
                       {group.rules}
                     </p>
                   ) : (
                     <p className="text-gray-400 italic text-center py-4">
                       Nessuna regola definita... vige l'anarchia! 🏴‍☠️
                     </p>
                   )}
                </div>
              )}
           </div>
        </div>

        {/* Floating Action Button */}
        <div className="fixed bottom-6 right-6 z-30">
          <button 
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-1 bg-black text-beer-gold p-4 rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.4)] hover:shadow-[0_15px_40px_rgba(255,191,0,0.6)] transform hover:-translate-y-2 hover:scale-105 transition-all duration-300 ring-4 ring-beer-gold/50 animate-bounce"
          >
            <Plus size={32} strokeWidth={3} />
            <Beer size={24} />
          </button>
        </div>

        {/* DEBT WALL - Refactored for Grouped Debts */}
        <div className="bg-white rounded-3xl shadow-xl p-6 border-4 border-beer-gold/30 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-400 to-yellow-300"></div>
          
          <h2 className="text-2xl font-black mb-6 text-center text-gray-800 flex items-center justify-center gap-2">
            <Wallet className="text-beer-dark" /> IL MURO DEL PIANTO
          </h2>

          {consolidatedDebts.length > 0 ? (
            <div className="space-y-4">
               {consolidatedDebts.map((item, i) => (
                  <div 
                    key={i} 
                    onClick={() => setSelectedDebtDetail(item)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-red-50 rounded-2xl border border-red-100 transform hover:scale-[1.01] transition-transform gap-4 cursor-pointer hover:shadow-lg hover:border-red-200"
                  >
                     
                     {/* Left: Debtor Info */}
                     <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center text-2xl animate-pulse shrink-0">🥵</div>
                        <div>
                           <p className="font-black text-xl text-gray-800">{item.debtorName}</p>
                           <p className="text-xs text-red-500 font-bold uppercase tracking-wider">DEVE OFFRIRE</p>
                        </div>
                     </div>
                     
                     {/* Middle: Breakdown */}
                     <div className="flex-1 text-sm text-gray-600 bg-white/50 p-3 rounded-lg border border-red-50">
                        <ul className="space-y-1">
                          {item.details.map((det, idx) => (
                            <li key={idx} className="flex justify-between border-b last:border-0 border-red-100 pb-1 last:pb-0">
                               <span>a <strong>{det.to}</strong></span>
                               <span className="font-bold text-red-600">{det.count} 🍺</span>
                            </li>
                          ))}
                        </ul>
                     </div>

                     {/* Right: Total */}
                     <div className="flex flex-col items-end shrink-0">
                        <span className="text-4xl font-black text-red-600">{item.total}</span>
                        <span className="text-sm font-bold text-gray-500 uppercase">TOTALE BIRRE</span>
                     </div>
                  </div>
               ))}
            </div>
          ) : (
             <div className="text-center py-10">
                <PartyPopper size={64} className="mx-auto text-green-500 mb-4 animate-wiggle" />
                <p className="text-xl font-bold text-gray-600">Nessun debito!</p>
                <p className="text-gray-400">Incredibile ma vero... offrite voi?</p>
             </div>
          )}
        </div>

        {/* MEMBERS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
           {group.members?.map((m, i) => (
              <div key={i} className="bg-white p-5 rounded-2xl shadow-sm hover:shadow-md transition-all flex items-center justify-between border border-gray-100">
                 <div className="flex items-center gap-3">
                    {/* Avatar Logic */}
                    <div className="relative shrink-0">
                      {m.photoURL && m.photoURL.length > 5 ? (
                         <img 
                           src={m.photoURL} 
                           alt={m.name} 
                           className="w-12 h-12 rounded-full border-2 border-gray-100 object-cover"
                           onError={(e) => {
                              e.target.onerror = null; 
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                           }} 
                         />
                      ) : null}
                      
                      <div 
                        className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-black border-2 border-gray-100 ${m.role === 'admin' ? 'bg-yellow-100 text-yellow-700 ring-2 ring-yellow-300' : 'bg-gray-100 text-gray-600'}`}
                        style={{ display: m.photoURL && m.photoURL.length > 5 ? 'none' : 'flex' }}
                      >
                         {m.role === 'admin' && <Crown size={14} className="absolute -top-2 -right-1 text-yellow-500" />}
                         {getInitials(m.name)}
                      </div>
                    </div>
                    
                       <div className="flex flex-col">
                          <p className="font-bold text-gray-800">{formatName(m.name)}</p>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">
                             {m.role === 'admin' ? 'AMMINISTRATORE' : 'MEMBRO'}
                          </p>
                       </div>
                 </div>

                  <div className="flex flex-col items-end gap-1">
                     {(() => {
                        const debtsCount = (group.debts || [])
                            .filter(d => d.debtorUid === m.uid)
                            .reduce((sum, d) => sum + d.count, 0);

                        const creditsCount = (group.debts || [])
                            .filter(d => d.creditorUid === m.uid)
                            .reduce((sum, d) => sum + d.count, 0);

                        return (
                           <>
                             {debtsCount > 0 && (
                                <div className="px-3 py-1 rounded-xl font-black text-sm bg-red-100 text-red-600 flex items-center gap-1" title="Deve offrire">
                                   <div className="w-4 h-4 rounded-full bg-red-200 flex items-center justify-center text-[10px]">🔴</div>
                                   {debtsCount}
                                </div>
                             )}
                             {creditsCount > 0 && (
                                <div className="px-3 py-1 rounded-xl font-black text-sm bg-green-100 text-green-600 flex items-center gap-1" title="Deve ricevere">
                                   <div className="w-4 h-4 rounded-full bg-green-200 flex items-center justify-center text-[10px]">🟢</div>
                                   {creditsCount}
                                </div>
                             )}
                             {debtsCount === 0 && creditsCount === 0 && (
                                <span className="text-xs text-gray-400 font-bold px-2">PARI</span>
                             )}
                           </>
                        );
                     })()}
                     
                     {isAdmin && m.uid !== currentUser.uid && (
                        <button 
                          onClick={() => handleRemoveMember(m.uid)} 
                          className="mt-2 px-3 py-1 bg-red-100/50 hover:bg-red-500 text-red-400 hover:text-white rounded-lg transition-all text-xs font-bold flex items-center gap-1 border border-red-200"
                          title="Rimuovi Membro dal Gruppo"
                        >
                           <UserMinus size={14} /> Ban
                        </button>
                     )}
                  </div>
              </div>
           ))}
        </div>

        {/* HISTORY */}
        <div className="bg-white/60 p-6 rounded-3xl">
           <h3 className="text-lg font-bold text-gray-500 mb-4 flex items-center gap-2">
              <History size={18} /> CRONACA NERA
           </h3>
           <div className="space-y-4">
              {history.map((h, i) => (
                 <div key={i} className="flex gap-3 text-sm text-gray-600 border-l-2 border-gray-200 pl-4 py-1">
                    <div className="font-mono text-xs text-gray-400 pt-1 shrink-0">{new Date(h.timestamp?.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                    <div>{h.message}</div>
                 </div>
              ))}
           </div>
        </div>

      </div>



       {/* DEBT DETAIL MODAL */}
       {selectedDebtDetail && (
         <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl p-6 w-full max-w-md relative shadow-2xl animate-in zoom-in-50 duration-300 border-4 border-beer-gold">
               <button 
                 onClick={() => setSelectedDebtDetail(null)}
                 className="absolute top-4 right-4 text-gray-400 hover:text-black transition-colors"
               >
                 <X size={28} />
               </button>

               <div className="text-center mb-6">
                 <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center text-4xl mx-auto mb-4 animate-bounce">🥵</div>
                 <h2 className="text-2xl font-black text-gray-800">{selectedDebtDetail.debtorName}</h2>
                 <p className="text-red-500 font-bold uppercase tracking-widest text-sm">ELENCO DEBITI</p>
               </div>

               <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-100 max-h-[60vh] overflow-y-auto">
                 {selectedDebtDetail.details.map((det, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm border border-gray-100">
                       <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-beer-gold text-white font-bold flex items-center justify-center text-xs">
                             {getInitials(det.to)}
                          </div>
                          <div>
                             <p className="text-sm text-gray-500">Deve a</p>
                             <p className="font-bold text-gray-800">{det.to}</p>
                          </div>
                       </div>
                       
                       <div className="flex items-center gap-3">
                          <span className="font-black text-xl text-beer-dark">{det.count} 🍺</span>
                          
                          {isAdmin && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAdminDeleteDebt(selectedDebtDetail.debtorName, det.creditorUid, det.to, selectedDebtDetail.rawDebtorUid);
                              }}
                              className="w-8 h-8 bg-red-100 text-red-500 rounded-lg flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
                              title="Rimuovi 1 Birra (Admin)"
                            >
                               <Trash2 size={16} />
                            </button>
                          )}
                       </div>
                    </div>
                 ))}
               </div>
               
               <p className="text-center text-xs text-gray-400 mt-4 italic">
                  {isAdmin ? "Admin Mode: Puoi cancellare singole birre." : "Tocca a te pagare!"}
               </p>
            </div>
         </div>
       )}

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-pop">
            <div className="bg-gradient-to-r from-beer-amber to-beer-gold p-6 text-center relative overflow-hidden">
               <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMiIvPgo8L3N2Zz4=')] opacity-30"></div>
               <h3 className="text-2xl font-black text-white relative z-10 drop-shadow-md">NUOVA TRANSAZIONE</h3>
               <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-white/80 hover:text-white font-bold text-xl">✕</button>
            </div>
            
            <div className="p-6 space-y-6">
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">Chi è il colpevole?</label>
                <select 
                  className="w-full p-3 bg-gray-50 border-2 border-transparent focus:border-beer-gold rounded-xl font-bold text-lg outline-none transition-all"
                  value={actingUser} 
                  onChange={e => setActingUser(e.target.value)}
                >
                  {group.members.map(m => (
                    <option key={m.uid} value={m.uid}>{formatName(m.name)}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setTransType('deve')}
                  className={`p-4 rounded-2xl font-black text-lg transition-all border-2 ${transType === 'deve' ? 'bg-red-50 border-red-500 text-red-600 scale-105 shadow-lg' : 'bg-gray-50 border-transparent text-gray-400 hover:bg-gray-100'}`}
                >
                  DEVE 🍺
                </button>
                <button 
                  onClick={() => setTransType('ha_pagato')}
                  className={`p-4 rounded-2xl font-black text-lg transition-all border-2 ${transType === 'ha_pagato' ? 'bg-green-50 border-green-500 text-green-600 scale-105 shadow-lg' : 'bg-gray-50 border-transparent text-gray-400 hover:bg-gray-100'}`}
                >
                  HA PAGATO 💸
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">
                  {transType === 'deve' ? 'A CHI DEVE OFFRIRE?' : 'PER CHI HA PAGATO?'}
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                  {group.members.filter(m => m.uid !== actingUser).map(m => (
                    <label 
                      key={m.uid} 
                      onClick={() => handleToggleRecipient(m.uid)}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border-2 ${selectedRecipients.includes(m.uid) ? 'bg-beer-gold/10 border-beer-gold' : 'bg-white border-gray-100 hover:border-gray-300'}`}
                    >
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedRecipients.includes(m.uid) ? 'bg-beer-gold border-beer-gold text-white' : 'border-gray-300'}`}>
                        {selectedRecipients.includes(m.uid) && <span className="text-xs">✓</span>}
                      </div>
                      <span className="font-bold text-gray-700">{formatName(m.name)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button 
                  onClick={handleSubmitTransaction}
                   className="w-full py-4 bg-black text-white font-black text-xl rounded-2xl shadow-xl hover:bg-gray-900 transform active:scale-95 transition-all"
                >
                  CONFERMA
                </button>

            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {showImagePreview && group?.photoURL && (
        <div 
          className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setShowImagePreview(false)}
        >
           <img 
             src={group.photoURL} 
             alt={group.name} 
             className="max-w-full max-h-[90vh] rounded-xl shadow-2xl animate-pop" 
           />
           <button className="absolute top-6 right-6 text-white text-xl font-bold bg-white/10 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/20">
             ✕
           </button>
        </div>
      )}

    </div>
  );
}
