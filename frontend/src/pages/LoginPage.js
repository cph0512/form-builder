import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store';
import { FileText, Loader } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@company.com');
  const [password, setPassword] = useState('Admin@1234');
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('登入成功');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || '登入失敗，請確認帳號密碼');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
    }}>
      <div style={{ width: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, background: '#1a56db', borderRadius: 16, marginBottom: 12 }}>
            <FileText size={28} color="#fff" />
          </div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>智慧表單平台</h1>
          <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 4 }}>企業客戶資料收集系統</p>
        </div>

        {/* Login Card */}
        <div className="card" style={{ padding: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24, color: 'var(--text)' }}>登入帳號</h2>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label className="label">電子郵件</label>
              <input className="input" type="email" value={email}
                onChange={e => setEmail(e.target.value)} required placeholder="your@email.com" />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label className="label">密碼</label>
              <input className="input" type="password" value={password}
                onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
            </div>
            <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
              {loading ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> 登入中...</> : '登入'}
            </button>
          </form>

          <div style={{ marginTop: 20, padding: 12, background: 'var(--surface-2)', borderRadius: 8, fontSize: 13, color: 'var(--text-2)' }}>
            <strong>預設帳號：</strong>admin@company.com<br />
            <strong>預設密碼：</strong>Admin@1234
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
