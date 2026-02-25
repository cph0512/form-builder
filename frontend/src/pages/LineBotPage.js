import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  MessageSquare, Link2, FileText, Bell, Radio,
  Plus, Trash2, Edit2, Upload, Copy, RefreshCw,
  User, Users, CheckCircle, Clock, XCircle, ChevronDown, ChevronUp,
} from 'lucide-react';

// ─── 常數 ────────────────────────────────────────────────────────────────────

const REMINDER_TYPES = [
  { value: 'birthday',   label: '生日提醒' },
  { value: 'test_drive', label: '試駕提醒' },
  { value: 'follow_up',  label: '跟進提醒' },
  { value: 'contract',   label: '合約到期提醒' },
  { value: 'custom',     label: '自訂提醒' },
];

const REPEAT_TYPES = [
  { value: 'once',    label: '僅一次' },
  { value: 'weekly',  label: '每週' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly',  label: '每年' },
];

const TABS = [
  { key: 'bindings',      label: '綁定管理',  icon: <Link2   size={16} /> },
  { key: 'conversations', label: '對話記錄',  icon: <MessageSquare size={16} /> },
  { key: 'reminders',     label: '提醒排程',  icon: <Bell    size={16} /> },
  { key: 'templates',     label: '訊息範本',  icon: <FileText size={16} /> },
  { key: 'broadcasts',    label: '群發管理',  icon: <Radio   size={16} /> },
];

// ─── 樣式輔助 ────────────────────────────────────────────────────────────────

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 16 };
const badge = (bg, color) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 99, background: bg, color, fontSize: 12, fontWeight: 600 });

function StatusBadge({ status }) {
  const map = {
    pending:  ['#fef9c3', '#854d0e', '待上傳'],
    uploaded: ['#dcfce7', '#166534', '已上傳'],
    failed:   ['#fee2e2', '#991b1b', '失敗'],
    sending:  ['#dbeafe', '#1e40af', '發送中'],
    done:     ['#dcfce7', '#166534', '已完成'],
  };
  const [bg, color, text] = map[status] || ['#f1f5f9', '#475569', status];
  return <span style={badge(bg, color)}>{text}</span>;
}

// ─── 主頁面 ──────────────────────────────────────────────────────────────────

export default function LineBotPage() {
  const [tab, setTab] = useState('bindings');
  const [stats, setStats] = useState(null);

  useEffect(() => {
    axios.get('/api/linebot/stats').then(r => setStats(r.data)).catch(() => {});
  }, []);

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: 0 }}>LINE Bot 管理</h1>
        <p style={{ color: '#64748b', marginTop: 4, marginBottom: 0 }}>管理 LINE 綁定、對話記錄、提醒排程、訊息範本與群發</p>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: '已綁定帳號', value: stats.activeBindings,   color: '#1a56db' },
            { label: '待上傳對話', value: stats.pendingConvs,     color: '#d97706' },
            { label: '待發送提醒', value: stats.pendingReminders, color: '#7c3aed' },
            { label: '進行中群發', value: stats.activebroadcasts, color: '#0891b2' },
          ].map(s => (
            <div key={s.label} style={{ ...card, marginBottom: 0, padding: '16px 20px' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e2e8f0', marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 18px', background: 'transparent', border: 'none',
            borderBottom: tab === t.key ? '2px solid #1a56db' : '2px solid transparent',
            marginBottom: -2, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit',
            color: tab === t.key ? '#1a56db' : '#64748b', fontWeight: tab === t.key ? 600 : 400,
            transition: 'all 0.15s',
          }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'bindings'      && <BindingsTab />}
      {tab === 'conversations' && <ConversationsTab />}
      {tab === 'reminders'     && <RemindersTab />}
      {tab === 'templates'     && <TemplatesTab />}
      {tab === 'broadcasts'    && <BroadcastsTab />}
    </div>
  );
}

// ─── Tab: 綁定管理 ────────────────────────────────────────────────────────────

function BindingsTab() {
  const [bindings, setBindings] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [codeModal, setCodeModal] = useState(false);
  const [genUserId, setGenUserId] = useState('');
  const [generatedCode, setGeneratedCode] = useState(null);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, u] = await Promise.all([
        axios.get('/api/linebot/bindings'),
        axios.get('/api/auth/users'),
      ]);
      setBindings(b.data);
      setUsers(u.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUnbind = async (userId, name) => {
    if (!window.confirm(`確定要解除 ${name} 的 LINE 綁定？`)) return;
    await axios.delete(`/api/linebot/bindings/${userId}`);
    toast.success('已解除綁定');
    load();
  };

  const handleGenerateCode = async () => {
    if (!genUserId) return toast.error('請選擇使用者');
    setGenerating(true);
    try {
      const { data } = await axios.post('/api/linebot/bindings/generate-code', { platform_user_id: genUserId });
      setGeneratedCode(data);
    } catch (err) {
      toast.error(err.response?.data?.error || '產生失敗');
    } finally {
      setGenerating(false);
    }
  };

  // 已綁定的 user ID 集合
  const boundIds = new Set(bindings.map(b => b.platform_user_id));
  const unboundUsers = users.filter(u => !boundIds.has(u.id));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>已綁定帳號（{bindings.length}）</h3>
        <button onClick={() => { setCodeModal(true); setGeneratedCode(null); setGenUserId(''); }} style={btnPrimary}>
          <Plus size={15} /> 產生綁定碼
        </button>
      </div>

      {loading ? <LoadingRow /> : bindings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>尚無綁定帳號</div>
      ) : (
        <div style={card}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                {['平台帳號', 'LINE 名稱', '狀態', '綁定時間', '操作'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: '#64748b', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bindings.map(b => (
                <tr key={b.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <User size={14} color="#94a3b8" />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{b.user_name}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>{b.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {b.line_picture_url && <img src={b.line_picture_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />}
                      <span style={{ fontSize: 14 }}>{b.line_display_name || '—'}</span>
                    </div>
                  </td>
                  <td style={td}>
                    <span style={badge(b.is_active ? '#dcfce7' : '#fee2e2', b.is_active ? '#166534' : '#991b1b')}>
                      {b.is_active ? '已啟用' : '已停用'}
                    </span>
                  </td>
                  <td style={{ ...td, fontSize: 13, color: '#64748b' }}>{fmtDate(b.created_at)}</td>
                  <td style={td}>
                    <button onClick={() => handleUnbind(b.platform_user_id, b.user_name)} style={btnDanger}>
                      <Trash2 size={14} /> 解除綁定
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Generate Code Modal */}
      {codeModal && (
        <Modal title="產生綁定碼" onClose={() => setCodeModal(false)}>
          {!generatedCode ? (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>選擇使用者（尚未綁定）</label>
                <select value={genUserId} onChange={e => setGenUserId(e.target.value)} style={inputStyle}>
                  <option value="">— 請選擇 —</option>
                  {unboundUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name}（{u.email}）</option>
                  ))}
                </select>
              </div>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
                綁定碼有效期 24 小時。使用者需在 LINE Bot 傳送：<br />
                <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>/綁定 [碼]</code>
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setCodeModal(false)} style={btnSecondary}>取消</button>
                <button onClick={handleGenerateCode} disabled={generating} style={btnPrimary}>
                  {generating ? <RefreshCw size={14} style={spin} /> : <Plus size={14} />}
                  產生綁定碼
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>綁定碼（24 小時內有效）</div>
              <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: 8, color: '#1a56db', fontFamily: 'monospace' }}>
                {generatedCode.code}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8, marginBottom: 20 }}>
                到期時間：{fmtDate(generatedCode.expires_at)}
              </div>
              <button onClick={() => { navigator.clipboard.writeText(generatedCode.code); toast.success('已複製綁定碼'); }} style={btnPrimary}>
                <Copy size={14} /> 複製綁定碼
              </button>
              <button onClick={() => setCodeModal(false)} style={{ ...btnSecondary, marginLeft: 8 }}>關閉</button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ─── Tab: 對話記錄 ────────────────────────────────────────────────────────────

function ConversationsTab() {
  const [convs, setConvs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState({});
  const [uploading, setUploading] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/linebot/conversations?limit=50');
      setConvs(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleExpand = async (id) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!detail[id]) {
      const { data } = await axios.get(`/api/linebot/conversations/${id}`);
      setDetail(d => ({ ...d, [id]: data }));
    }
  };

  const handleUpload = async (id) => {
    setUploading(u => ({ ...u, [id]: true }));
    try {
      await axios.post(`/api/linebot/conversations/${id}/upload-crm`);
      toast.success('已標記為已上傳 CRM');
      load();
    } catch {
      toast.error('上傳失敗');
    } finally {
      setUploading(u => ({ ...u, [id]: false }));
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>對話記錄</h3>
        <button onClick={load} style={btnSecondary}><RefreshCw size={14} /> 重新整理</button>
      </div>

      {loading ? <LoadingRow /> : convs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>尚無對話記錄</div>
      ) : (
        <div style={card}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                {['來源', '訊息數', '業務員', 'CRM 狀態', '更新時間', '操作'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: '#64748b', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {convs.map(c => (
                <React.Fragment key={c.id}>
                  <tr style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer' }} onClick={() => handleExpand(c.id)}>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {c.source_type === 'group' ? <Users size={14} color="#7c3aed" /> : <User size={14} color="#1a56db" />}
                        <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#475569' }}>
                          {c.source_id.slice(0, 12)}...
                        </span>
                        {c.source_type === 'group' && <span style={badge('#ede9fe', '#6d28d9')}>群組</span>}
                      </div>
                    </td>
                    <td style={td}><span style={{ fontWeight: 600, color: '#1a56db' }}>{c.message_count || 0}</span></td>
                    <td style={{ ...td, fontSize: 13, color: '#475569' }}>{c.user_name || '—'}</td>
                    <td style={td}><StatusBadge status={c.crm_status} /></td>
                    <td style={{ ...td, fontSize: 13, color: '#64748b' }}>{fmtDate(c.updated_at)}</td>
                    <td style={td} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {c.crm_status === 'pending' && (
                          <button onClick={() => handleUpload(c.id)} disabled={uploading[c.id]} style={btnPrimary}>
                            <Upload size={13} /> 上傳 CRM
                          </button>
                        )}
                        <button onClick={() => handleExpand(c.id)} style={btnSecondary}>
                          {expandedId === c.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === c.id && detail[c.id] && (
                    <tr>
                      <td colSpan={6} style={{ background: '#f8fafc', padding: '12px 20px' }}>
                        {/* AI 摘要區塊 */}
                        {detail[c.id].ai_summary && (
                          <div style={{ marginBottom: 14, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '10px 14px' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#0369a1', marginBottom: 6 }}>🤖 AI 摘要</div>
                            <div style={{ fontSize: 13, color: '#0f172a', whiteSpace: 'pre-line', lineHeight: 1.6 }}>
                              {detail[c.id].ai_summary}
                            </div>
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, fontWeight: 600 }}>對話內容</div>
                        {(detail[c.id].messages || []).length === 0 ? (
                          <div style={{ color: '#94a3b8', fontSize: 13 }}>無訊息記錄</div>
                        ) : (
                          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                            {(detail[c.id].messages || []).map((m, i) => (
                              <div key={i} style={{ padding: '6px 10px', marginBottom: 4, background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>
                                  {m.sender?.slice(0, 12)}... · {fmtDate(m.time)}
                                </div>
                                <div style={{ fontSize: 13, color: '#0f172a' }}>{m.text}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: 提醒排程 ────────────────────────────────────────────────────────────

const EMPTY_REMINDER = { type: 'birthday', label: '', target_id: '', trigger_at: '', repeat_type: 'once', message_template: '' };

function RemindersTab() {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_REMINDER);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/linebot/reminders');
      setReminders(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_REMINDER); setShowModal(true); };
  const openEdit = (r) => {
    setEditing(r);
    setForm({
      type: r.type,
      label: r.label || '',
      target_id: r.target_id || '',
      trigger_at: r.trigger_at ? r.trigger_at.slice(0, 16) : '',
      repeat_type: r.repeat_type || 'once',
      message_template: r.message_template || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.trigger_at || !form.message_template) return toast.error('請填寫觸發時間和訊息內容');
    setSaving(true);
    try {
      if (editing) {
        await axios.put(`/api/linebot/reminders/${editing.id}`, form);
        toast.success('已更新提醒');
      } else {
        await axios.post('/api/linebot/reminders', form);
        toast.success('已新增提醒');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('確定要刪除此提醒？')) return;
    await axios.delete(`/api/linebot/reminders/${id}`);
    toast.success('已刪除');
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>提醒排程（{reminders.length}）</h3>
        <button onClick={openCreate} style={btnPrimary}><Plus size={15} /> 新增提醒</button>
      </div>

      {loading ? <LoadingRow /> : reminders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>尚無提醒排程</div>
      ) : (
        <div style={card}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                {['類型', '標籤', '觸發時間', '週期', '狀態', '操作'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: '#64748b', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reminders.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={td}>
                    <span style={badge('#dbeafe', '#1e40af')}>
                      {REMINDER_TYPES.find(t => t.value === r.type)?.label || r.type}
                    </span>
                  </td>
                  <td style={{ ...td, fontSize: 14 }}>{r.label || '—'}</td>
                  <td style={{ ...td, fontSize: 13, color: '#475569' }}>{fmtDate(r.trigger_at)}</td>
                  <td style={{ ...td, fontSize: 13 }}>{REPEAT_TYPES.find(t => t.value === r.repeat_type)?.label || r.repeat_type}</td>
                  <td style={td}>
                    {r.is_sent
                      ? <span style={badge('#dcfce7', '#166534')}><CheckCircle size={11} style={{ marginRight: 3 }} />已發送</span>
                      : <span style={badge('#fef9c3', '#854d0e')}><Clock size={11} style={{ marginRight: 3 }} />待發送</span>}
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {!r.is_sent && <button onClick={() => openEdit(r)} style={btnSecondary}><Edit2 size={13} /></button>}
                      <button onClick={() => handleDelete(r.id)} style={btnDanger}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editing ? '編輯提醒' : '新增提醒'} onClose={() => setShowModal(false)}>
          <ReminderForm form={form} setForm={setForm} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button onClick={() => setShowModal(false)} style={btnSecondary}>取消</button>
            <button onClick={handleSave} disabled={saving} style={btnPrimary}>
              {saving ? <RefreshCw size={14} style={spin} /> : null}儲存
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ReminderForm({ form, setForm }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>提醒類型</label>
          <select value={form.type} onChange={e => set('type', e.target.value)} style={inputStyle}>
            {REMINDER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>週期</label>
          <select value={form.repeat_type} onChange={e => set('repeat_type', e.target.value)} style={inputStyle}>
            {REPEAT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label style={labelStyle}>客戶姓名（標籤）</label>
        <input value={form.label} onChange={e => set('label', e.target.value)} placeholder="例：王小明" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>目標 LINE ID</label>
        <input value={form.target_id} onChange={e => set('target_id', e.target.value)} placeholder="LINE user ID 或 group ID" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>觸發時間 *</label>
        <input type="datetime-local" value={form.trigger_at} onChange={e => set('trigger_at', e.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>訊息內容 *</label>
        <textarea
          value={form.message_template}
          onChange={e => set('message_template', e.target.value)}
          rows={4}
          placeholder="可使用 {{客戶姓名}}、{{提醒類型}} 變數"
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
          可用變數：{'{{客戶姓名}}'} 、{'{{提醒類型}}'}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: 訊息範本 ────────────────────────────────────────────────────────────

const EMPTY_TEMPLATE = { name: '', content: '', variables: [] };

function TemplatesTab() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_TEMPLATE);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/linebot/templates');
      setTemplates(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_TEMPLATE); setShowModal(true); };
  const openEdit = (t) => { setEditing(t); setForm({ name: t.name, content: t.content, variables: t.variables || [] }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name || !form.content) return toast.error('請填寫名稱和內容');
    setSaving(true);
    try {
      if (editing) {
        await axios.put(`/api/linebot/templates/${editing.id}`, form);
        toast.success('已更新範本');
      } else {
        await axios.post('/api/linebot/templates', form);
        toast.success('已新增範本');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('確定要刪除此範本？')) return;
    await axios.delete(`/api/linebot/templates/${id}`);
    toast.success('已刪除');
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>訊息範本（{templates.length}）</h3>
        <button onClick={openCreate} style={btnPrimary}><Plus size={15} /> 新增範本</button>
      </div>

      {loading ? <LoadingRow /> : templates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>尚無訊息範本</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {templates.map(t => (
            <div key={t.id} style={{ ...card, marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: '#0f172a' }}>{t.name}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => openEdit(t)} style={btnSecondary}><Edit2 size={13} /></button>
                  <button onClick={() => handleDelete(t.id)} style={btnDanger}><Trash2 size={13} /></button>
                </div>
              </div>
              <pre style={{ fontSize: 13, color: '#475569', background: '#f8fafc', borderRadius: 8, padding: '10px 12px', margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', maxHeight: 100, overflowY: 'auto' }}>
                {t.content}
              </pre>
              {t.variables?.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {t.variables.map(v => <span key={v} style={badge('#f1f5f9', '#475569')}>{'{{'}{v}{'}}'}</span>)}
                </div>
              )}
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10 }}>{fmtDate(t.created_at)}</div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editing ? '編輯範本' : '新增範本'} onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>範本名稱 *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="例：生日問候" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>訊息內容 *</label>
              <textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={5}
                placeholder="親愛的 {{客戶姓名}}，祝您生日快樂！"
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
            <div>
              <label style={labelStyle}>使用的變數（逗號分隔）</label>
              <input
                value={(form.variables || []).join(', ')}
                onChange={e => setForm(f => ({ ...f, variables: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                placeholder="客戶姓名, 業務員姓名"
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button onClick={() => setShowModal(false)} style={btnSecondary}>取消</button>
            <button onClick={handleSave} disabled={saving} style={btnPrimary}>
              {saving ? <RefreshCw size={14} style={spin} /> : null}儲存
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Tab: 群發管理 ────────────────────────────────────────────────────────────

function BroadcastsTab() {
  const [broadcasts, setBroadcasts] = useState([]);
  const [bindings, setBindings] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ message_content: '', target_line_ids: [], useTemplate: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, bi, t] = await Promise.all([
        axios.get('/api/linebot/broadcasts'),
        axios.get('/api/linebot/bindings'),
        axios.get('/api/linebot/templates'),
      ]);
      setBroadcasts(b.data);
      setBindings(bi.data.filter(b => b.is_active && b.line_user_id));
      setTemplates(t.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSend = async () => {
    if (!form.message_content) return toast.error('請填寫訊息內容');
    if (form.target_line_ids.length === 0) return toast.error('請選擇至少一位接收者');
    if (!window.confirm(`確定要發送給 ${form.target_line_ids.length} 位用戶？`)) return;
    setSaving(true);
    try {
      await axios.post('/api/linebot/broadcasts', {
        message_content: form.message_content,
        target_line_ids: form.target_line_ids,
      });
      toast.success('群發任務已建立，正在發送中');
      setShowModal(false);
      setForm({ message_content: '', target_line_ids: [], useTemplate: '' });
      setTimeout(load, 1000);
    } catch (err) {
      toast.error(err.response?.data?.error || '建立失敗');
    } finally {
      setSaving(false);
    }
  };

  const toggleTarget = (lineId) => {
    setForm(f => ({
      ...f,
      target_line_ids: f.target_line_ids.includes(lineId)
        ? f.target_line_ids.filter(id => id !== lineId)
        : [...f.target_line_ids, lineId],
    }));
  };

  const selectAll = () => setForm(f => ({ ...f, target_line_ids: bindings.map(b => b.line_user_id) }));
  const clearAll  = () => setForm(f => ({ ...f, target_line_ids: [] }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>群發記錄（{broadcasts.length}）</h3>
        <button onClick={() => setShowModal(true)} style={btnPrimary}><Radio size={15} /> 建立群發</button>
      </div>

      {loading ? <LoadingRow /> : broadcasts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>尚無群發記錄</div>
      ) : (
        <div style={card}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                {['建立者', '訊息預覽', '狀態', '進度', '建立時間'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: '#64748b', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {broadcasts.map(b => (
                <tr key={b.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ ...td, fontSize: 14 }}>{b.creator_name}</td>
                  <td style={{ ...td, fontSize: 13, color: '#475569', maxWidth: 220 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.message_content}
                    </div>
                  </td>
                  <td style={td}><StatusBadge status={b.status} /></td>
                  <td style={td}>
                    <div style={{ fontSize: 13 }}>
                      <span style={{ color: '#16a34a', fontWeight: 600 }}>{b.sent_count}</span>
                      <span style={{ color: '#94a3b8' }}> / {b.total_count}</span>
                      {b.failed_count > 0 && <span style={{ color: '#dc2626', marginLeft: 6 }}>（{b.failed_count} 失敗）</span>}
                    </div>
                    <div style={{ marginTop: 4, height: 4, background: '#f1f5f9', borderRadius: 99, width: 100 }}>
                      <div style={{ height: '100%', background: '#1a56db', borderRadius: 99, width: `${b.total_count ? (b.sent_count / b.total_count) * 100 : 0}%` }} />
                    </div>
                  </td>
                  <td style={{ ...td, fontSize: 13, color: '#64748b' }}>{fmtDate(b.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title="建立群發" onClose={() => setShowModal(false)} wide>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {templates.length > 0 && (
              <div>
                <label style={labelStyle}>套用訊息範本（選填）</label>
                <select
                  value={form.useTemplate}
                  onChange={e => {
                    const tpl = templates.find(t => t.id === e.target.value);
                    setForm(f => ({ ...f, useTemplate: e.target.value, message_content: tpl ? tpl.content : f.message_content }));
                  }}
                  style={inputStyle}
                >
                  <option value="">— 自訂訊息 —</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={labelStyle}>訊息內容 *</label>
              <textarea
                value={form.message_content}
                onChange={e => setForm(f => ({ ...f, message_content: e.target.value }))}
                rows={4}
                placeholder="輸入訊息內容..."
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>
                  接收者（{form.target_line_ids.length}/{bindings.length} 已選）
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={selectAll} style={btnSecondary}>全選</button>
                  <button onClick={clearAll} style={btnSecondary}>清除</button>
                </div>
              </div>
              {bindings.length === 0 ? (
                <div style={{ fontSize: 13, color: '#94a3b8', padding: '12px 0' }}>無已綁定的活躍帳號</div>
              ) : (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: 200, overflowY: 'auto' }}>
                  {bindings.map(b => (
                    <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}>
                      <input
                        type="checkbox"
                        checked={form.target_line_ids.includes(b.line_user_id)}
                        onChange={() => toggleTarget(b.line_user_id)}
                      />
                      {b.line_picture_url && <img src={b.line_picture_url} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />}
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{b.line_display_name}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>{b.user_name}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button onClick={() => setShowModal(false)} style={btnSecondary}>取消</button>
            <button onClick={handleSend} disabled={saving} style={btnPrimary}>
              {saving ? <RefreshCw size={14} style={spin} /> : <Radio size={14} />}
              發送群發
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── 通用元件 ────────────────────────────────────────────────────────────────

function Modal({ title, children, onClose, wide }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', width: wide ? 600 : 480, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LoadingRow() {
  return <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>載入中...</div>;
}

// ─── 樣式常數 ────────────────────────────────────────────────────────────────

const td = { padding: '10px 12px', verticalAlign: 'middle' };

const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '7px 14px', background: '#1a56db', color: '#fff', border: 'none',
  borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 500,
};
const btnSecondary = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '7px 12px', background: '#f8fafc', color: '#475569',
  border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
};
const btnDanger = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '6px 10px', background: '#fef2f2', color: '#dc2626',
  border: '1px solid #fecaca', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
};
const inputStyle = {
  width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
  fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', color: '#0f172a',
};
const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 };
const spin = { animation: 'spin 1s linear infinite' };

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
