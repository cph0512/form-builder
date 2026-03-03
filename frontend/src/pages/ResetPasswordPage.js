import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { FileText, Loader, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
      }}>
        <div className="card" style={{ padding: 32, width: 400, textAlign: 'center' }}>
          <p style={{ color: 'var(--text-2)', marginBottom: 16 }}>無效的重設連結。</p>
          <Link to="/forgot-password" className="btn btn-primary">重新申請</Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error('兩次輸入的密碼不一致');
      return;
    }
    if (password.length < 6) {
      toast.error('密碼至少 6 個字元');
      return;
    }
    setLoading(true);
    try {
      await axios.post('/api/auth/reset-password', { token, password });
      toast.success('密碼重設成功！請重新登入');
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.error || '重設失敗，請重新申請');
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
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, background: '#1a56db', borderRadius: 16, marginBottom: 12 }}>
            <FileText size={28} color="#fff" />
          </div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>智慧表單平台</h1>
          <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 4 }}>企業客戶資料收集系統</p>
        </div>

        <div className="card" style={{ padding: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>設定新密碼</h2>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 24 }}>請輸入您的新密碼（至少 6 個字元）。</p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label className="label">新密碼</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="至少 6 個字元"
                  style={{ paddingRight: 40 }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 4 }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div style={{ marginBottom: 24 }}>
              <label className="label">確認新密碼</label>
              <input
                className="input"
                type={showPw ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                placeholder="再次輸入新密碼"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={loading}
            >
              {loading ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> 儲存中...</> : '儲存新密碼'}
            </button>
          </form>

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Link to="/login" style={{ color: '#1a56db', fontSize: 13, textDecoration: 'none' }}>返回登入</Link>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
