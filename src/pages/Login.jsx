import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Beer } from 'lucide-react';

export default function Login() {
  const { loginWithGoogle, currentUser } = useAuth();
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = React.useState(window.deferredPrompt);
  const [isIOS, setIsIOS] = React.useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = React.useState(false);

  useEffect(() => {
    if (currentUser) {
      navigate('/dashboard');
    }

    // Check if device is iOS
    const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(isIosDevice);

    // Check if event already happened
    if (window.deferredPrompt) {
      setDeferredPrompt(window.deferredPrompt);
    }

    // Listen for the custom event we dispatched in main.jsx
    const handlePromptReady = () => {
      setDeferredPrompt(window.deferredPrompt);
    };
    window.addEventListener('deferred-prompt-ready', handlePromptReady);

    // Keep the native listener just in case (though main.jsx handles it)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      window.deferredPrompt = e;
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('deferred-prompt-ready', handlePromptReady);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [currentUser, navigate]);

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
      navigate('/dashboard');
    } catch (error) {
      console.error("Failed to login", error);
    }
  };

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSInstructions(true);
      return;
    }
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-gray-900 to-black">
      
      {/* Background Bubbles */}
      <div className="absolute inset-0 pointer-events-none">
         {[...Array(20)].map((_, i) => (
            <div key={i} 
                 className="absolute rounded-full bg-beer-gold opacity-10 animate-foam-rise"
                 style={{
                    left: `${Math.random() * 100}%`,
                    width: `${Math.random() * 40 + 10}px`,
                    height: `${Math.random() * 40 + 10}px`,
                    animationDelay: `${Math.random() * 5}s`,
                    bottom: '-50px'
                 }}
            />
         ))}
      </div>

      <div className="text-center space-y-8 z-10 glass-dark p-8 md:p-12 rounded-3xl shadow-2xl max-w-lg w-full transform hover:scale-105 transition-transform duration-500">
        
        <div className="flex justify-center mb-4">
          <div className="p-6 bg-beer-gold/20 rounded-full animate-float ring-4 ring-beer-gold/30">
             <Beer size={80} className="text-beer-gold drop-shadow-[0_0_15px_rgba(255,215,0,0.8)]" />
          </div>
        </div>
        
        <div className="space-y-2">
           <h1 className="text-5xl md:text-6xl font-black text-white tracking-tight">
             beer<span className="text-beer-gold">counter</span>
           </h1>
           <div className="min-h-[4rem] px-4"> 
             <p className="text-xl md:text-2xl text-gray-300 font-medium animate-[pop_1s_ease-out] leading-relaxed">
               "La birra non si dimentica,<br className="hidden md:block"/> e nemmeno chi deve pagarla."
             </p>
           </div>
        </div>

        <button 
          onClick={handleLogin}
          className="group relative w-full py-5 px-6 overflow-hidden rounded-2xl bg-beer-gold text-black font-extrabold text-xl shadow-[0_0_20px_rgba(255,215,0,0.4)] transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(255,215,0,0.6)] active:scale-95"
        >
          <div className="absolute inset-0 w-full h-full bg-white/30 skew-x-12 -translate-x-full group-hover:animate-[shimmer_1s_infinite]"></div>
          <span className="relative flex items-center justify-center gap-3">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="G" />
            Accedi con Google
          </span>
        </button>

        {(deferredPrompt || isIOS) && (
          <button 
            onClick={handleInstallClick}
            className="w-full py-3 px-6 rounded-xl border-2 border-beer-gold text-beer-gold font-bold hover:bg-beer-gold/10 transition-colors animate-pulse"
          >
            📲 Installa l'app per non perderti neanche una goccia... di notifica! 🍺
          </button>
        )}
        
        {/* iOS Instructions Modal */}
        {showIOSInstructions && (
          <div className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50 p-4" onClick={() => setShowIOSInstructions(false)}>
            <div className="bg-gray-900 border border-beer-gold/30 rounded-3xl p-6 w-full max-w-sm text-center relative animate-slide-up" onClick={e => e.stopPropagation()}>
               <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-beer-gold p-3 rounded-full shadow-[0_0_20px_rgba(255,215,0,0.5)]">
                 <img src="/pwa-192x192.png" alt="App Icon" className="w-12 h-12 rounded-xl" onError={(e) => e.target.style.display = 'none'} />
                 <span className="text-3xl" style={{display: 'none'}}>🍺</span> 
               </div>
               
               <h3 className="text-xl font-bold text-white mt-4 mb-2">Installa su iPhone</h3>
               <p className="text-gray-300 mb-6">L'app si installa in 2 secondi:</p>
               
               <div className="space-y-4 text-left text-gray-200">
                  <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-xl">
                    <span className="text-2xl">1️⃣</span>
                    <span>Tocca il tasto <strong>Condividi</strong> <span className="text-blue-400 text-xl inline-block align-middle">⎋</span> (in basso)</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-xl border border-beer-gold/30">
                    <span className="text-2xl">2️⃣</span>
                    <span>Scorri e scegli <strong>"Aggiungi alla schermata Home"</strong> ➕</span>
                  </div>
               </div>

               <button 
                 onClick={() => setShowIOSInstructions(false)}
                 className="mt-6 w-full py-3 bg-beer-gold text-black font-bold rounded-xl"
               >
                 Capito! 🍻
               </button>
            </div>
          </div>
        )}

        <div className="text-sm text-gray-400 space-y-1">
          <p>🍺 Nessuna registrazione richiesta</p>
          <p>Solo tanta sete.</p>
        </div>
      </div>

      
      <footer className="absolute bottom-6 text-center text-gray-600 text-xs">
        <p>&copy; 2025 Beercounter.it • Bevi responsabilmente (o segna tutto qui)</p>
      </footer>
    </div>
  );
}
