import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Plus, Globe, Zap, Settings, Edit2, Loader,
  CheckCircle, XCircle, Eye, EyeOff, TestTube, ArrowLeftRight,
} from 'lucide-react';
import { useAuthStore } from '../store';
import { useSelectorInspector, InspectorBtn, SelectorInspectorModal } from '../components/SelectorInspector';

const TYPE_LABELS = {
  rpa_web:        'RPA 網頁自動化',
  salesforce_api: 'Salesforce API',
  generic_api:    '通用 REST API',
};
const TYPE_COLORS = {
  rpa_web:        { bg: '#fef3c7', color: '#92400e' },
  salesforce_api: { bg: '#dbeafe', color: '#1e40af' },
  generic_api:    { bg: '#d1fae5', color: '#065f46' },
};
const EMPTY_CFG = {
  loginUsername: '', loginPassword: '', loginSelector: '',
  passwordSelector: '', submitSelector: '',
  dataEntryUrl: '', formSubmitSelector: '',          // RPA 新增
  instanceUrl: '', clientId: '', clientSecret: '', username: '',
  password: '', securityToken: '', apiVersion: 'v58.0', sfObjectType: 'Lead',
  apiKey: '', method: 'POST', authHeader: 'Authorization', additionalHeaders: '',
};
const EMPTY_FORM = { name: '', type: 'rpa_web', url: '', config: { ...EMPTY_CFG } };

export default function CrmConnectionsPage() {
  const { user } = useAuthStore();
  const [connections, setConnections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingConn, setEditingConn] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [showPwd, setShowPwd] = useState(false);

  const isAdmin = ['super_admin', 'dept_admin'].includes(user?.role);
  const inspector = useSelectorInspector();

  useEffect(() => { fetchConnections(); }, []);

  const fetchConnections = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get('/api/crm/connections');
      setConnections(res.data);
    } catch { toast.error('載入連線列表失敗'); }
    finally { setIsLoading(false); }
  };

  const openAdd = () => {
    setEditingConn(null);
    setForm(EMPTY_FORM);
    setShowPwd(false);
    setShowModal(true);
  };
  const openEdit = (conn) => {
    setEditingConn(conn);
    setForm({ name: conn.name, type: conn.type, url: conn.url || '', config: { ...EMPTY_CFG, ...(conn.config || {}) } });
    setShowPwd(false);
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditingConn(null); };
  const setCfg = (k, v) => setForm(f => ({ ...f, config: { ...f.config, [k]: v } }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('請輸入連線名稱'); return; }
    if (!form.url.trim() && form.type !== 'salesforce_api') { toast.error('請輸入 CRM 網址'); return; }
    setIsSaving(true);
    try {
      if (editingConn) {
        const res = await axios.put(`/api/crm/connections/${editingConn.id}`, form);
        setConnections(c => c.map(x => x.id === editingConn.id ? res.data : x));
        toast.success('連線已更新');
      } else {
        const res = await axios.post('/api/crm/connections', form);
        setConnections(c => [res.data, ...c]);
        toast.success('連線已新增');
      }
      closeModal();
    } catch { toast.error('儲存失敗'); }
    finally { setIsSaving(false); }
  };

  const handleTest = async (id) => {
    setTestingId(id);
    setTestResults(r => ({ ...r, [id]: null }));
    try {
      const res = await axios.post(`/api/crm/connections/${id}/test`);
      setTestResults(r => ({ ...r, [id]: res.data }));
    } catch {
      setTestResults(r => ({ ...r, [id]: { accessible: false, error: '請求失敗' } }));
    } finally { setTestingId(null); }
  };

  const handleToggle = async (conn) => {
    try {
      await axios.put(`/api/crm/connections/${conn.id}`, { ...conn, is_active: !conn.is_active });
      setConnections(c => c.map(x => x.id === conn.id ? { ...x, is_active: !x.is_active } : x));
      toast.success(conn.is_active ? '已停用' : '已啟用');
    } catch { toast.error('操作失敗'); }
  };

  const stats = {
    total: connections.length,
    active: connections.filter(c => c.is_active).length,
    rpa: connections.filter(c => c.type === 'rpa_web').length,
    api: connections.filter(c => c.type !== 'rpa_web').length,
  };

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>CRM 連線管理</h1>
          <p style={{ color: 'var(--text-2)', fontSize: 14 }}>設定要自動寫入的 CRM 系統連線資訊</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={16} /> 新增連線
          </button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: '連線總數', value: stats.total,  color: '#6366f1' },
          { label: '啟用中',   value: stats.active, color: '#10b981' },
          { label: 'RPA 模式', value: stats.rpa,    color: '#f59e0b' },
          { label: 'API 模式', value: stats.api,    color: '#3b82f6' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <Loader size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
        </div>
      ) : connections.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <Globe size={40} color="var(--text-3)" style={{ marginBottom: 12 }} />
          <div style={{ fontWeight: 600, marginBottom: 6 }}>尚未新增任何 CRM 連線</div>
          <div style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 20 }}>
            新增連線後，表單提交時會自動寫入對應的 CRM 系統
          </div>
          {isAdmin && (
            <button className="btn btn-primary" onClick={openAdd}>
              <Plus size={16} /> 新增第一個連線
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {connections.map(conn => {
            const test = testResults[conn.id];
            const isTesting = testingId === conn.id;
            const tc = TYPE_COLORS[conn.type] || { bg: '#f3f4f6', color: '#374151' };
            return (
              <div key={conn.id} className="card"
                style={{ padding: '16px 20px', opacity: conn.is_active ? 1 : 0.6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {/* Icon */}
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: tc.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {conn.type === 'rpa_web' ? <Globe size={20} color={tc.color} />
                      : conn.type === 'salesforce_api' ? <Zap size={20} color={tc.color} />
                        : <Settings size={20} color={tc.color} />}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{conn.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, ...tc }}>
                        {TYPE_LABELS[conn.type]}
                      </span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20,
                        background: conn.is_active ? '#d1fae5' : '#f3f4f6',
                        color: conn.is_active ? '#065f46' : '#6b7280' }}>
                        {conn.is_active ? '啟用中' : '已停用'}
                      </span>
                    </div>
                    {conn.url && (
                      <div style={{ fontSize: 13, color: 'var(--text-2)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {conn.url}
                      </div>
                    )}
                    {test && (
                      <div style={{ fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4,
                        color: test.accessible ? '#10b981' : 'var(--danger)' }}>
                        {test.accessible
                          ? <><CheckCircle size={12} /> 連線正常{test.pageTitle ? `：${test.pageTitle}` : ''}</>
                          : <><XCircle size={12} /> {test.error || '連線失敗'}</>}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleTest(conn.id)}
                        disabled={isTesting} title="測試連線">
                        {isTesting
                          ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                          : <TestTube size={14} />}
                        測試
                      </button>
                      <Link to={`/crm/mapping?conn=${conn.id}`} className="btn btn-ghost btn-sm">
                        <ArrowLeftRight size={14} /> 欄位對應
                      </Link>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(conn)}>
                        <Edit2 size={14} />
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleToggle(conn)}
                        style={{ color: conn.is_active ? 'var(--danger)' : 'var(--primary)' }}>
                        {conn.is_active ? '停用' : '啟用'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="card" style={{ width: '100%', maxWidth: 560, padding: 28,
            maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>
              {editingConn ? '編輯 CRM 連線' : '新增 CRM 連線'}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Name */}
              <div>
                <label className="label">連線名稱 <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input className="input" placeholder="例：客戶關係管理系統"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>

              {/* Type */}
              <div>
                <label className="label">連線類型 <span style={{ color: 'var(--danger)' }}>*</span></label>
                <select className="input" value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="rpa_web">RPA 網頁自動化（無 API 的 CRM）</option>
                  <option value="salesforce_api">Salesforce REST API</option>
                  <option value="generic_api">通用 REST API</option>
                </select>
              </div>

              {/* URL（Salesforce 不需要） */}
              {form.type !== 'salesforce_api' && (
                <div>
                  <label className="label">CRM 網址 <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input className="input" placeholder="https://your-crm.example.com/login"
                    value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
                </div>
              )}

              {/* ── RPA 設定 ── */}
              {form.type === 'rpa_web' && (
                <>
                  <div style={{ padding: '12px 16px', background: '#fef3c7', borderRadius: 8,
                    fontSize: 13, color: '#92400e' }}>
                    💡 系統會用瀏覽器自動化登入 CRM，找到欄位後填入資料。請提供各欄位的 CSS Selector。
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <label className="label">登入帳號</label>
                      <input className="input" placeholder="CRM 帳號"
                        value={form.config.loginUsername} onChange={e => setCfg('loginUsername', e.target.value)} />
                    </div>
                    <div>
                      <label className="label">登入密碼</label>
                      <PwdInput value={form.config.loginPassword} show={showPwd}
                        onToggle={() => setShowPwd(s => !s)} placeholder="CRM 密碼"
                        onChange={v => setCfg('loginPassword', v)} />
                    </div>
                    <div>
                      <label className="label">帳號欄位 Selector</label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input className="input" style={{ flex: 1 }} placeholder="input[name='username']"
                          value={form.config.loginSelector} onChange={e => setCfg('loginSelector', e.target.value)} />
                        <InspectorBtn
                          disabled={!form.url}
                          title={form.url ? '截圖測試此 Selector' : '請先填寫 CRM 網址'}
                          onClick={() => inspector.open(form.url, form.config.loginSelector)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="label">密碼欄位 Selector</label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input className="input" style={{ flex: 1 }} placeholder="input[type='password']"
                          value={form.config.passwordSelector} onChange={e => setCfg('passwordSelector', e.target.value)} />
                        <InspectorBtn
                          disabled={!form.url}
                          title={form.url ? '截圖測試此 Selector' : '請先填寫 CRM 網址'}
                          onClick={() => inspector.open(form.url, form.config.passwordSelector)}
                        />
                      </div>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label className="label">登入按鈕 Selector</label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input className="input" style={{ flex: 1 }} placeholder="button[type='submit']"
                          value={form.config.submitSelector} onChange={e => setCfg('submitSelector', e.target.value)} />
                        <InspectorBtn
                          disabled={!form.url}
                          title={form.url ? '截圖測試此 Selector' : '請先填寫 CRM 網址'}
                          onClick={() => inspector.open(form.url, form.config.submitSelector)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* RPA 資料輸入頁設定 */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)',
                      textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                      資料填寫設定
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label className="label">資料輸入頁網址（登入後跳轉）</label>
                        <input className="input"
                          placeholder="空白 = 與登入頁相同；https://crm.example.com/leads/new"
                          value={form.config.dataEntryUrl}
                          onChange={e => setCfg('dataEntryUrl', e.target.value)} />
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                          若登入後 CRM 會自動導向資料輸入頁，可留空
                        </div>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label className="label">資料提交按鈕 Selector</label>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <input className="input" style={{ flex: 1 }}
                            placeholder="button.save-btn，留空則只填入欄位但不自動送出"
                            value={form.config.formSubmitSelector}
                            onChange={e => setCfg('formSubmitSelector', e.target.value)} />
                          <InspectorBtn
                            disabled={!(form.config.dataEntryUrl || form.url)}
                            title="截圖測試資料輸入頁面的提交按鈕"
                            onClick={() => inspector.open(form.config.dataEntryUrl || form.url, form.config.formSubmitSelector)}
                          />
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                          點擊 🔍 可截圖確認按鈕位置（測試網址為「資料輸入頁網址」，若未填則使用登入頁網址）
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ── Salesforce 設定 ── */}
              {form.type === 'salesforce_api' && (
                <>
                  <div style={{ padding: '12px 16px', background: '#dbeafe', borderRadius: 8,
                    fontSize: 13, color: '#1e40af' }}>
                    ⚡ 需先在 Salesforce 建立 Connected App，取得 Consumer Key / Secret 後填入。
                  </div>
                  <div>
                    <label className="label">Instance URL</label>
                    <input className="input" placeholder="https://yourorg.my.salesforce.com"
                      value={form.config.instanceUrl} onChange={e => setCfg('instanceUrl', e.target.value)} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <label className="label">Client ID（Consumer Key）</label>
                      <input className="input" placeholder="Consumer Key"
                        value={form.config.clientId} onChange={e => setCfg('clientId', e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Client Secret</label>
                      <PwdInput value={form.config.clientSecret} show={showPwd}
                        onToggle={() => setShowPwd(s => !s)} placeholder="Consumer Secret"
                        onChange={v => setCfg('clientSecret', v)} />
                    </div>
                    <div>
                      <label className="label">Salesforce 帳號</label>
                      <input className="input" placeholder="admin@yourorg.com"
                        value={form.config.username} onChange={e => setCfg('username', e.target.value)} />
                    </div>
                    <div>
                      <label className="label">密碼</label>
                      <PwdInput value={form.config.password || ''} show={showPwd}
                        onToggle={() => setShowPwd(s => !s)} placeholder="密碼 + Security Token"
                        onChange={v => setCfg('password', v)} />
                    </div>
                    <div>
                      <label className="label">API 版本</label>
                      <input className="input" placeholder="v58.0"
                        value={form.config.apiVersion} onChange={e => setCfg('apiVersion', e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Security Token（可選）</label>
                      <input className="input" placeholder="xxxxxxxxxxxxxxxx"
                        value={form.config.securityToken} onChange={e => setCfg('securityToken', e.target.value)} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label className="label">Salesforce Object 類型</label>
                      <select className="input" value={form.config.sfObjectType || 'Lead'}
                        onChange={e => setCfg('sfObjectType', e.target.value)}>
                        <option value="Lead">Lead（潛在客戶）</option>
                        <option value="Contact">Contact（聯絡人）</option>
                        <option value="Account">Account（帳戶）</option>
                        <option value="Opportunity">Opportunity（商機）</option>
                        <option value="Case">Case（客戶服務案件）</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* ── 通用 API 設定 ── */}
              {form.type === 'generic_api' && (
                <>
                  <div style={{ padding: '12px 16px', background: '#d1fae5', borderRadius: 8,
                    fontSize: 13, color: '#065f46' }}>
                    🔧 直接將表單資料以 JSON 格式傳送至指定 API 端點。
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <label className="label">HTTP 方法</label>
                      <select className="input" value={form.config.method}
                        onChange={e => setCfg('method', e.target.value)}>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="PATCH">PATCH</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Auth Header 名稱</label>
                      <input className="input" placeholder="Authorization"
                        value={form.config.authHeader} onChange={e => setCfg('authHeader', e.target.value)} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label className="label">API Key / Token</label>
                      <PwdInput value={form.config.apiKey} show={showPwd}
                        onToggle={() => setShowPwd(s => !s)} placeholder="Bearer your_api_key"
                        onChange={v => setCfg('apiKey', v)} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label className="label">額外 Headers（JSON，可選）</label>
                      <textarea className="input" rows={3}
                        placeholder={'{"X-Custom-Header": "value"}'}
                        value={form.config.additionalHeaders}
                        onChange={e => setCfg('additionalHeaders', e.target.value)}
                        style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }} />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end',
              marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost" onClick={closeModal}>取消</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
                {isSaving
                  ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> 儲存中...</>
                  : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Selector 測試工具 Modal */}
      <SelectorInspectorModal inspector={inspector} />
    </div>
  );
}

/* 密碼輸入元件 */
function PwdInput({ value, show, onToggle, placeholder, onChange }) {
  return (
    <div style={{ position: 'relative' }}>
      <input className="input" type={show ? 'text' : 'password'}
        placeholder={placeholder} value={value}
        onChange={e => onChange(e.target.value)}
        style={{ paddingRight: 36 }} />
      <button type="button" onClick={onToggle} style={{
        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)',
        display: 'flex', alignItems: 'center',
      }}>
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}
