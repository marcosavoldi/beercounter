import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

export function useNotifications() {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, "users", currentUser.uid, "notifications"),
      orderBy("timestamp", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setNotifications(notes);
      setUnreadCount(notes.filter(n => !n.read).length);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching notifications:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const markAsRead = async (notificationId) => {
    if (!currentUser) return;
    try {
      const ref = doc(db, "users", currentUser.uid, "notifications", notificationId);
      await updateDoc(ref, { read: true });
    } catch (e) {
      console.error("Error marking notification as read:", e);
    }
  };

  const markAllAsRead = async () => {
    if (!currentUser || notifications.length === 0) return;
    const batch = writeBatch(db);
    notifications.forEach(note => {
      if (!note.read) {
        const ref = doc(db, "users", currentUser.uid, "notifications", note.id);
        batch.update(ref, { read: true });
      }
    });
    try {
      await batch.commit();
    } catch (e) {
      console.error("Error marking all as read:", e);
    }
  };

  const deleteNotification = async (notificationId) => {
    if (!currentUser) return;
    try {
      await deleteDoc(doc(db, "users", currentUser.uid, "notifications", notificationId));
    } catch (e) {
      console.error("Error deleting notification:", e);
    }
  };

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead, deleteNotification };
}
