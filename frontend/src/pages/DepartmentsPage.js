import React, { useState, useEffect } from 'react';
import { useDeptStore } from '../store';
import { PlusCircle, Edit2, Trash2, Building2, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DepartmentsPage() {
  const { departments, isLoading, fetchDepartments, createDepartment, updateDepartment, deleteDepartment } = useDeptStore();

  const [showModal, setShowModal] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [deptName, setDeptName] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // dept id

  useEffect(() => { fetchDepartments(); }, []);

  const openCreate = () => {
    setEditingDept(null);
    setDeptName('');
    setShowModal(true);
  };

  const openEdit = (dept) => {
    setEditingDept(dept);
    setDeptName(dept.name);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!deptName.trim()) { toast.error('請輸入部門名稱'); return; }
    setSaving(true);
    try {
      if (editingDept) {
        await updateDepartment(editingDept.id, { name: deptName });
        toast.success('部門名稱已更新');
      } else {
        await createDepartment({ name: deptName });
        toast.success('部門已建立');
      }
      setShowModal(false);
    } catch (err) {
      toast.error(err.response?.data?.error || '操作失敗，請重試');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteDepartment(id);
      toast.success('部門已刪除');
      setConfirmDelete(null);
    } catch (err) {
      toast.error(err.response?.data?.error || '刪除失敗');
      setConfirmDelete(null);
    }
  };

  const totalMembers = departments.reduce((sum, d) => sum + parseInt(d.member_count || 0), 0);

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>部門管理</h1>
          <p style={{ color: 'var(--text-2)', fontSize: 14, marginTop: 4 }}>建立與管理組織部門架構</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <PlusCircle size={16} /> 新增部門
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 32, maxWidth: 480 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#1a56db' }}>{departments.length}</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>部門總數</div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#10b981' }}>{totalMembers}</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>在職成員</div>
        </div>
      </div>

      {/* Department Cards */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>載入中...</div>
      ) : departments.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <Building2 size={48} color="var(--text-3)" style={{ marginBottom: 12 }} />
          <p style={{ color: 'var(--text-2)', fontSize: 15 }}>尚未建立任何部門</p>
          <button className="btn btn-primary" onClick={openCreate} style={{ marginTop: 16 }}>
            建立第一個部門
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {departments.map(dept => (
            <div key={dept.id} className="card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, background: '#eff6ff', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Building2 size={20} color="#1a56db" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{dept.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                      建立於 {new Date(dept.created_at).toLocaleDateString('zh-TW')}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(dept)} title="重新命名">
                    <Edit2 size={13} />
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setConfirmDelete(dept.id)}
                    title="刪除部門"
                    style={{ color: parseInt(dept.member_count) > 0 ? '#94a3b8' : '#ef4444' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#f8fafc', borderRadius: 8 }}>
                <Users size={14} color="var(--text-2)" />
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  <strong style={{ color: 'var(--text)', fontWeight: 700 }}>{dept.member_count}</strong> 位在職成員
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增/編輯 Modal */}
      {showModal && (
        <ModalOverlay onClose={() => setShowModal(false)}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>
            {editingDept ? '重新命名部門' : '新增部門'}
          </h2>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>部門名稱 *</label>
              <input
                className="form-input"
                value={deptName}
                onChange={e => setDeptName(e.target.value)}
                placeholder="例：業務部、客服部"
                autoFocus
                required
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>取消</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? '儲存中...' : (editingDept ? '更新' : '建立')}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {/* 刪除確認 Modal */}
      {confirmDelete && (
        <ModalOverlay onClose={() => setConfirmDelete(null)}>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ width: 56, height: 56, background: '#fef2f2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Trash2 size={24} color="#ef4444" />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>確認刪除部門？</h2>
            <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 24 }}>
              刪除後無法復原。若部門仍有在職成員，將無法刪除。
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>取消</button>
              <button className="btn" style={{ background: '#ef4444', color: '#fff' }} onClick={() => handleDelete(confirmDelete)}>
                確認刪除
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

function ModalOverlay({ children, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card" style={{ width: 440, padding: 32, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
          <X size={20} />
        </button>
        {children}
      </div>
    </div>
  );
}
