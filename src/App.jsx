import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Group from './pages/Group';
import Join from './pages/Join';
import Privacy from './pages/Privacy';
import CookiePolicy from './pages/CookiePolicy';

function PrivateRoute({ children }) {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/" />;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route 
            path="/dashboard" 
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            } 
          />
          <Route 
            path="/group/:groupId" 
            element={
              <PrivateRoute>
                <Group />
              </PrivateRoute>
            } 
          />
          <Route 
            path="/join" 
            element={
              <PrivateRoute>
                <Join />
              </PrivateRoute>
            } 
          />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/cookie-policy" element={<CookiePolicy />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
