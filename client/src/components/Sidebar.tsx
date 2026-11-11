import { Link, useLocation } from 'react-router-dom';
import { Sparkles, LayoutDashboard, Image, Settings, CreditCard, HelpCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();

  const mainNavItems = [
    { path: '/', label: 'Generate', icon: Sparkles, description: 'Create AI images' },
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'View your activity' },
  ];

  const toolsNavItems = [
    { path: '/upscale', label: 'Upscale', icon: Image, description: 'Enhance images' },
  ];

  const accountNavItems = [
    { path: '/settings', label: 'Settings', icon: Settings, description: 'Preferences' },
    ...(isAuthenticated ? [{ path: '/billing', label: 'Billing', icon: CreditCard, description: 'Plan & usage' }] : []),
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
      <div className="p-6 border-b border-gray-200 dark:border-gray-800">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold">
          <motion.div whileHover={{ rotate: 360 }} transition={{ duration: 0.5 }}>
            <Sparkles className="w-6 h-6 text-primary" />
          </motion.div>
          <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
            Aether AI
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-6">
        <div>
          <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Main
          </p>
          <ul className="space-y-1">
            {mainNavItems.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive(item.path)
                      ? 'bg-primary/10 text-primary'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${isActive(item.path) ? 'text-primary' : 'text-gray-400'}`} />
                  <div className="flex-1">
                    <span className="block">{item.label}</span>
                    <span className="text-xs text-gray-400 font-normal">{item.description}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Tools
          </p>
          <ul className="space-y-1">
            {toolsNavItems.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive(item.path)
                      ? 'bg-primary/10 text-primary'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${isActive(item.path) ? 'text-primary' : 'text-gray-400'}`} />
                  <div className="flex-1">
                    <span className="block">{item.label}</span>
                    <span className="text-xs text-gray-400 font-normal">{item.description}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {isAuthenticated && (
          <div>
            <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Account
            </p>
            <ul className="space-y-1">
              {accountNavItems.map((item) => (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    onClick={onClose}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive(item.path)
                        ? 'bg-primary/10 text-primary'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <item.icon className={`w-5 h-5 ${isActive(item.path) ? 'text-primary' : 'text-gray-400'}`} />
                    <div className="flex-1">
                      <span className="block">{item.label}</span>
                      <span className="text-xs text-gray-400 font-normal">{item.description}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-gray-200 dark:border-gray-800">
        {isAuthenticated ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-medium text-primary">
                {user?.email.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {user?.email}
              </p>
              <p className="text-xs text-gray-500 capitalize">{user?.plan} Plan</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <HelpCircle className="w-4 h-4" />
            <span>Anonymous session</span>
          </div>
        )}
      </div>
    </div>
  );
}
