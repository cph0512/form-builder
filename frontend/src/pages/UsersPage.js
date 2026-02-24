import React, { useState, useEffect } from 'react';
import { useUserStore, useDeptStore, useAuthStore } from '../store';
import { PlusCircle, Edit2, KeyRound, ToggleLeft, ToggleRight, Users, X, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

const ROLE_LABELS = {
  super_admin: '超級管理員',
  dept_admin: '部門管理員',
  manager: '主管',
  staff: '一般人員',
};

const ROLE_COLORS = {
  super_admin: { bg: '#fef3c7', color: '#92400e' },
  dept_admin: { bg: '#dbeafe', color: '#1e40af' },
  manager: { bg: '#d1fae5', color: '#065f46' },
  staff: { bg: '#f1f5f9', color: '#475569' },
};

const emptyForm = { name: '', email: '', password: '', role: 'staff', department_id: '' };

export default function UsersPage() {
  const { user: currentUser } = useAuthStore();
  const { users, isLoading, fetchUsers, createUser, updateUser, toggleUserStatus } = useUserStore();
  const { departments, fetchDepartments } = useDeptStore();

  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);   // null = 新增模式
  const [showPwdModal, setShowPwdModal] = useState(null); // user id
  const [form, setForm] = useState(emptyForm);
  const [newPwd, setNewPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);

  const isSuperAdmin = currentUser?.role === 'super_admin';

  useEffect(() => {
    fetchUsers();
    fetchDepartments();
  }, []);

  const openCreate = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setShowPwd(false);
    setShowModal(true);
  };

  const openEdit = (u) => {
    setEditingUser(u);
    setForm({
      name: u.name,
      email: u.email,
      password: '',
      role: u.role,
      department_id: u.department_id || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('請輸入姓名'); return; }
    if (!editingUser && !form.email.trim()) { toast.error('請輸入 Email'); return; }
    if (!editingUser && form.password.length < 6) { toast.error('密碼至少 6 個字元'); return; }

    setSaving(true);
    try {
      if (editingUser) {
        await updateUser(editingUser.id, {
          name: form.name,
          role: form.role,
          department_id: form.department_id || null,
        });
        toast.success('使用者資訊已更新');
      } else {
        await createUser({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          department_id: form.department_id || null,
        });
        toast.success('使用者已建立');
      }
      setShowModal(false);
    } catch (err) {
      toast.error(err.response?.data?.error || '操作失敗，請重試');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (u) => {
    if (u.id === currentUser.id) { toast.error('無法停用自己的帳號'); return; }
    try {
      const res = await toggleUserStatus(u.id);
      toast.success(`帳號已${res.is_active ? '啟用' : '停用'}`);
    } catch (err) {
      toast.error(err.response?.data?.error || '操作失敗');
    }
  };

  const handleResetPwd = async (e) => {
    e.preventDefault();
    if (newPwd.length < 6) { toast.error('密碼至少 6 個字元'); return; }
    setSaving(true);
    try {
      const { resetPassword } = useUserStore.getState();
      await resetPassword(showPwdModal, newPwd);
      toast.success('密碼已重設');
      setShowPwdModal(null);
      setNewPwd('');
    } catch (err) {
      toast.error('重設失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>使用者管理</h1>
          <p style={{ color: 'var(--text-2)', fontSize: 14, marginTop: 4 }}>管理系統帳號與角色權限</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <PlusCircle size={16} /> 新增使用者
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: '使用者總數', value: users.length, color: '#1a56db' },
          { label: '帳號啟用中', value: users.filter(u => u.is_active).length, color: '#10b981' },
          { label: '已停用帳號', value: users.filter(u => !u.is_active).length, color: '#94a3b8' },
          { label: '管理員人數', value: users.filter(u => ['super_admin', 'dept_admin'].includes(u.role)).length, color: '#f59e0b' },
        ].map(stat => (
          <div key={stat.label} className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* User Table */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>載入中...</div>
      ) : users.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <Users size={48} color="var(--text-3)" style={{ marginBottom: 12 }} />
          <p style={{ color: 'var(--text-2)', fontSize: 15 }}>尚未建立任何使用者</p>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['姓名', 'Email', '角色', '部門', '狀態', '操作'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, background: '#1a56db', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#fff', fontWeight: 700, flexShrink: 0 }}>
                        {u.name.charAt(0)}
                      </div>
                      <span style={{ fontWeight: 500, fontSize: 14 }}>{u.name}</span>
                      {u.id === currentUser.id && <span style={{ fontSize: 11, background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>我</span>}
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 14, color: 'var(--text-2)' }}>{u.email}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 8px', borderRadius: 20, ...ROLE_COLORS[u.role] }}>
                      {ROLE_LABELS[u.role]}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 14, color: 'var(--text-2)' }}>{u.dept_name || '—'}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <span className={`badge ${u.is_active ? 'badge-green' : 'badge-gray'}`}>
                      {u.is_active ? '啟用中' : '已停用'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(u)} title="編輯">
                        <Edit2 size={13} />
                      </button>
                      {isSuperAdmin && (
                        <button className="btn btn-secondary btn-sm" onClick={() => { setShowPwdModal(u.id); setNewPwd(''); }} title="重設密碼">
                          <KeyRound size={13} />
                        </button>
                      )}
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleToggle(u)}
                        title={u.is_active ? '停用帳號' : '啟用帳號'}
                        disabled={u.id === currentUser.id}
                        style={{ opacity: u.id === currentUser.id ? 0.4 : 1 }}
                      >
                        {u.is_active ? <ToggleRight size={14} color="#10b981" /> : <ToggleLeft size={14} color="#94a3b8" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 新增/編輯 Modal */}
      {showModal && (
        <ModalOverlay onClose={() => setShowModal(false)}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>
            {editingUser ? '編輯使用者' : '新增使用者'}
          </h2>
          <form onSubmit={handleSubmit}>
            <FormField label="姓名 *">
              <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="請輸入姓名" required />
            </FormField>
            {!editingUser && (
              <FormField label="Email *">
                <input className="form-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="請輸入 Email" required />
              </FormField>
            )}
            {!editingUser && (
              <FormField label="密碼 *">
                <div style={{ position: 'relative' }}>
                  <input className="form-input" type={showPwd ? 'text' : 'password'} value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder="至少 6 個字元" style={{ paddingRight: 40 }} />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </FormField>
            )}
            <FormField label="角色 *">
              <select className="form-input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                {isSuperAdmin && <option value="super_admin">超級管理員</option>}
                <option value="dept_admin">部門管理員</option>
                <option value="manager">主管</option>
                <option value="staff">一般人員</option>
              </select>
            </FormField>
            <FormField label="部門">
              <select className="form-input" value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })}>
                <option value="">— 不指定 —</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </FormField>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>取消</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? '儲存中...' : (editingUser ? '更新' : '建立')}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {/* 重設密碼 Modal */}
      {showPwdModal && (
        <ModalOverlay onClose={() => setShowPwdModal(null)}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>重設密碼</h2>
          <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 24 }}>
            為 <strong>{users.find(u => u.id === showPwdModal)?.name}</strong> 設定新密碼
          </p>
          <form onSubmit={handleResetPwd}>
            <FormField label="新密碼 *">
              <div style={{ position: 'relative' }}>
                <input className="form-input" type={showPwd ? 'text' : 'password'} value={newPwd}
                  onChange={e => setNewPwd(e.target.value)} placeholder="至少 6 個字元" style={{ paddingRight: 40 }} />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </FormField>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowPwdModal(null)}>取消</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '重設中...' : '確認重設'}</button>
            </div>
          </form>
        </ModalOverlay>
      )}
    </div>
  );
}

function ModalOverlay({ children, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card" style={{ width: 480, padding: 32, position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
          <X size={20} />
        </button>
        {children}
      </div>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}
