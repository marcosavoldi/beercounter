import React from 'react';

export default function Privacy() {
  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Privacy Policy</h1>
      <p>Questa applicazione utilizza Firebase Authentication e Firestore.</p>
      <p>I dati raccolti includono nome, email, e foto profilo forniti da Google.</p>
      <p>I dati sono utilizzati esclusivamente per il funzionamento dell'app (gestione gruppi e debiti).</p>
      {/* Add full text from backup later */}
    </div>
  );
}
