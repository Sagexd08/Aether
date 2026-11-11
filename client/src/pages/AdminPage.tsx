import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import axios from 'axios';
import { Settings, Activity } from 'lucide-react';

export default function AdminPage() {
  const [adminToken, setAdminToken] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [usage, setUsage] = useState<any>(null);

  useEffect(() => {
    const token = sessionStorage.getItem('admin_token');
    if (token) {
      setAdminToken(token);
      checkAuth(token);
    }
  }, []);

  const checkAuth = async (token: string) => {
    try {
      const response = await axios.get('/api/admin/usage', {
        headers: { 'x-admin-token': token },
        params: { days: 7 },
      });
      setIsAuthenticated(true);
      setUsage(response.data);
    } catch (error) {
      setIsAuthenticated(false);
    }
  };

  const handleLogin = () => {
    if (!adminToken.trim()) return;
    sessionStorage.setItem('admin_token', adminToken);
    checkAuth(adminToken);
  };

  if (!isAuthenticated) {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Admin Login
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Admin Token</label>
            <Input
              type="password"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              placeholder="Enter admin token"
              onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>
          <Button onClick={handleLogin} className="w-full">
            Login
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Usage Analytics (Last 7 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {usage && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Usage by Endpoint</h3>
                <div className="space-y-2">
                  {usage.usage_by_endpoint?.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span>{item.endpoint}</span>
                      <span>{item.count} requests</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Top IPs</h3>
                <div className="space-y-2">
                  {usage.top_ips?.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="font-mono text-xs">{item.ip_hash.substring(0, 16)}...</span>
                      <span>{item.request_count} requests</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

