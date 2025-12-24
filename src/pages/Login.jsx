import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Beer } from 'lucide-react';

export default function Login() {
  const { loginWithGoogle, currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (currentUser) {
      navigate('/dashboard');
    }
  }, [currentUser, navigate]);

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
      navigate('/dashboard');
    } catch (error) {
      console.error("Failed to login", error);
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
           <div className="h-8"> 
             <p className="text-xl md:text-2xl text-gray-300 typewriter font-mono">
               La birra non si dimentica.
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
