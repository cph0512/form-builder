import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { FileText, Loader, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post('/api/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      toast.error(err.response?.data?.error || '發送失敗，請稍後再試');
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
          {sent ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✉️</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>信件已寄出</h2>
              <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
                若 <strong>{email}</strong> 已在系統中註冊，您將收到密碼重設連結，請查收信箱（包含垃圾信件夾）。
              </p>
              <Link to="/login" style={{ color: '#1a56db', fontSize: 14, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ArrowLeft size={14} /> 返回登入
              </Link>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>忘記密碼</h2>
              <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 24 }}>
                輸入您的帳號 Email，我們將發送密碼重設連結給您。
              </p>
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 20 }}>
                  <label className="label">電子郵件</label>
                  <input
                    className="input"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    placeholder="your@email.com"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={loading}
                >
                  {loading ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> 發送中...</> : '發送重設連結'}
                </button>
              </form>
              <div style={{ marginTop: 20, textAlign: 'center' }}>
                <Link to="/login" style={{ color: '#1a56db', fontSize: 14, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <ArrowLeft size={14} /> 返回登入
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
