import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Landing from './pages/Landing';
import Create from './pages/Create';
import Dashboard from './pages/Dashboard';
import UpscalePage from './pages/UpscalePage';
import AdminPage from './pages/AdminPage';
import Layout from './components/Layout';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider } from './contexts/AuthContext';
import { OnboardingModal } from './components/OnboardingModal';

function App() {
  const [isDark, setIsDark] = useState(() => {
    try {
      return localStorage.getItem('aether_theme') === 'dark';
    } catch {
      return false;
    }
  });
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('lexigraph_onboarding_seen');
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      localStorage.setItem('aether_theme', isDark ? 'dark' : 'light');
    } catch {
      return;
    }
  }, [isDark]);

  const handleOnboardingClose = () => {
    localStorage.setItem('lexigraph_onboarding_seen', 'true');
    setShowOnboarding(false);
  };

  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Layout isDark={isDark} setIsDark={setIsDark}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/create" element={<Create />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/upscale" element={<UpscalePage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Routes>
          </Layout>
          <OnboardingModal isOpen={showOnboarding} onClose={handleOnboardingClose} />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;

