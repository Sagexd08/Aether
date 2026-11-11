import { getAccessToken } from '@/lib/accessToken';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Image, Clock, Zap, ArrowRight, TrendingUp } from 'lucide-react';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface DashboardStats {
  totalGenerations: number;
  generationsToday: number;
  generationsThisWeek: number;
  favoriteModel: string;
  averageGenerationTime: number;
  recentGenerations: Array<{
    request_id: string;
    image_url: string;
    positive_prompt: string;
    model: string;
    created_at: string;
  }>;
}

export default function Dashboard() {
  const { isAuthenticated, user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const headers: Record<string, string> = {};

      if (isAuthenticated) {
        const token = getAccessToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }

      const response = await fetch(`${API_BASE}/api/jobs/history?limit=20`, { headers });
      if (!response.ok) throw new Error('Failed to fetch stats');

      const data = await response.json();
      const generations = data.generations || [];

      const now = new Date();
      const today = now.toDateString();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const generationsToday = generations.filter((g: any) =>
        new Date(g.created_at).toDateString() === today
      ).length;

      const generationsThisWeek = generations.filter((g: any) =>
        new Date(g.created_at) > oneWeekAgo
      ).length;

      const modelCounts: Record<string, number> = {};
      generations.forEach((g: any) => {
        modelCounts[g.model] = (modelCounts[g.model] || 0) + 1;
      });
      const favoriteModel = Object.entries(modelCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'sd15';

      setStats({
        totalGenerations: generations.length,
        generationsToday,
        generationsThisWeek,
        favoriteModel,
        averageGenerationTime: 0,
        recentGenerations: generations.slice(0, 6),
      });
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getPlanLimit = () => {
    switch (user?.plan) {
      case 'free': return 20;
      case 'pro': return 100;
      case 'admin': return Infinity;
      default: return 20;
    }
  };

  const planLimit = getPlanLimit();
  const usagePercentage = planLimit === Infinity ? 0 : ((stats?.generationsToday || 0) / planLimit) * 100;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Welcome back! Here's your creative activity overview.
          </p>
        </div>
        <Link to="/">
          <Button size="lg">
            <Sparkles className="w-5 h-5 mr-2" />
            Create New
          </Button>
        </Link>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Generations</p>
                <p className="text-3xl font-bold mt-1">{stats?.totalGenerations || 0}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Image className="w-6 h-6 text-primary" />
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Today's Generations</p>
                <p className="text-3xl font-bold mt-1">{stats?.generationsToday || 0}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Zap className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">This Week</p>
                <p className="text-3xl font-bold mt-1">{stats?.generationsThisWeek || 0}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Favorite Model</p>
                <p className="text-xl font-bold mt-1 uppercase">{stats?.favoriteModel || 'SD15'}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Clock className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-1"
        >
          <GlassCard className="p-6 h-full">
            <h3 className="text-lg font-semibold mb-4">Usage This Period</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Daily Usage</span>
                  <span className="font-medium">
                    {stats?.generationsToday || 0} / {planLimit === Infinity ? '∞' : planLimit}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full transition-all ${
                      usagePercentage > 80 ? 'bg-red-500' : 'bg-primary'
                    }`}
                    style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">Current Plan</p>
                    <p className="text-sm text-muted-foreground capitalize">{user?.plan || 'Free'}</p>
                  </div>
                  {user?.plan === 'free' && (
                    <Link to="/billing">
                      <Button variant="outline" size="sm">
                        Upgrade
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6 }}
          className="lg:col-span-2"
        >
          <GlassCard className="p-6 h-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Recent Creations</h3>
              <Link to="/" className="text-sm text-primary hover:underline flex items-center gap-1">
                View All <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {stats?.recentGenerations && stats.recentGenerations.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {stats.recentGenerations.map((gen, idx) => (
                  <motion.div
                    key={gen.request_id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 * idx }}
                    className="group relative aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800"
                  >
                    {gen.image_url ? (
                      <img
                        src={gen.image_url}
                        alt={gen.positive_prompt}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <Image className="w-8 h-8" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="absolute bottom-2 left-2 right-2">
                        <p className="text-white text-xs line-clamp-2">{gen.positive_prompt}</p>
                        <Badge variant="secondary" className="mt-1 text-xs">
                          {gen.model}
                        </Badge>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Image className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No generations yet</p>
                <Link to="/" className="text-primary hover:underline mt-2 inline-block">
                  Create your first image
                </Link>
              </div>
            )}
          </GlassCard>
        </motion.div>
      </div>
    </div>
  );
}
