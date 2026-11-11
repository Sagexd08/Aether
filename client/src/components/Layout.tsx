import { Link, useLocation } from 'react-router-dom';
import { Moon, Sun, Sparkles, Image, Settings, User, LogOut, LayoutDashboard } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { Button } from './ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { LoginModal } from './LoginModal';
import { RegisterModal } from './RegisterModal';
import { SiteFooter } from './SiteFooter';

interface LayoutProps {
  children: React.ReactNode;
  isDark: boolean;
  setIsDark: (dark: boolean) => void;
}

export default function Layout({ children, isDark, setIsDark }: LayoutProps) {
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuth();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  const navItems = [
    { path: '/create', label: 'Create', icon: Sparkles },
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/upscale', label: 'Upscale', icon: Image },
  ];

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen text-foreground relative">
      <nav className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold group">
            <motion.div
              whileHover={{ rotate: 360 }}
              transition={{ duration: 0.5 }}
            >
              <Sparkles className="w-6 h-6 text-primary" />
            </motion.div>
            <span className="font-light tracking-tight">Aether AI</span>
          </Link>

          <div className="flex items-center gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link key={item.path} to={item.path}>
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button
                      variant={isActive ? 'default' : 'ghost'}
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <Icon className="w-4 h-4" />
                      <span className="hidden sm:inline">{item.label}</span>
                    </Button>
                  </motion.div>
                </Link>
              );
            })}

            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsDark(!isDark)}
                className="flex items-center gap-2"
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            </motion.div>

            {isAuthenticated ? (
              <>
                <span className="text-sm text-muted-foreground hidden md:inline">
                  {user?.email}
                </span>
                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLogout}
                    className="flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                  </Button>
                </motion.div>
              </>
            ) : (
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsLoginOpen(true)}
                  className="flex items-center gap-2"
                >
                  <User className="w-4 h-4" />
                  <span className="hidden sm:inline">Sign In</span>
                </Button>
              </motion.div>
            )}

            <Link to="/admin">
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button variant="ghost" size="sm" className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                </Button>
              </motion.div>
            </Link>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {children}
        </motion.div>
      </main>

      <SiteFooter />

      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onRegisterClick={() => {
          setIsLoginOpen(false);
          setIsRegisterOpen(true);
        }}
      />

      <RegisterModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onLoginClick={() => {
          setIsRegisterOpen(false);
          setIsLoginOpen(true);
        }}
      />
    </div>
  );
}

