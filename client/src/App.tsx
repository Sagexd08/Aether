import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import UpscalePage from './pages/UpscalePage';
import AdminPage from './pages/AdminPage';
import Layout from './components/Layout';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider } from './contexts/AuthContext';
import { OnboardingModal } from './components/OnboardingModal';

function App() {
  const [isDark, setIsDark] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('lexigraph_onboarding_seen');
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
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
              <Route path="/" element={<Home />} />
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

