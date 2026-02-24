import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FileText, Search, ChevronLeft, ChevronRight, X, Eye, Download } from 'lucide-react';
import { useFormStore } from '../store';

const CRM_STATUS = {
  pending:  { label: '待同步',   color: '#f59e0b', bg: '#fef3c7' },
  success:  { label: '已同步',   color: '#10b981', bg: '#d1fae5' },
  failed:   { label: '失敗',     color: '#ef4444', bg: '#fee2e2' },
  syncing:  { label: '同步中',   color: '#3b82f6', bg: '#dbeafe' },
  partial:  { label: '部分同步', color: '#f59e0b', bg: '#fef3c7' },
  not_configured: { label: '未設定', color: '#94a3b8', bg: '#f1f5f9' },
};

export default function SubmissionsPage() {
  const { forms, fetchForms } = useFormStore();
  const [submissions, setSubmissions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFormId, setSelectedFormId] = useState('');
  const [detail, setDetail] = useState(null); // 詳細記錄 modal
  const LIMIT = 20;

  useEffect(() => { fetchForms(); }, []);

  const fetchSubmissions = async (p = 1, fid = selectedFormId) => {
    setIsLoading(true);
    try {
      const params = { page: p, limit: LIMIT };
      if (fid) params.form_id = fid;
      const res = await axios.get('/api/submissions', { params });
      // 相容新格式 { data, total } 與舊格式（陣列）
      const payload = res.data;
      const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
      const count = typeof payload?.total === 'number' ? payload.total : rows.length;
      setSubmissions(rows);
      setTotal(count);
      setPage(p);
    } catch {
      toast.error('載入失敗');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchSubmissions(1, selectedFormId); }, [selectedFormId]);

  const totalPages = Math.ceil(total / LIMIT);

  const exportCsv = () => {
    if (!detail) return;
    const rows = [['欄位', '內容']];
    Object.entries(detail.data || {}).forEach(([k, v]) => {
      rows.push([k, Array.isArray(v) ? v.join(', ') : (v || '')]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `submission_${detail.id?.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportBulkCsv = async () => {
    if (!selectedFormId) return;
    try {
      const res = await axios.get('/api/submissions/export', {
        params: { form_id: selectedFormId },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers['content-disposition'];
      const match = disposition && disposition.match(/filename\*?=(?:UTF-8'')?([^;\n]*)/i);
      a.download = match ? decodeURIComponent(match[1].replace(/"/g, '')) : 'submissions.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV 匯出成功');
    } catch {
      toast.error('匯出失敗，請重試');
    }
  };

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>提交記錄</h1>
          <p style={{ color: 'var(--text-2)', fontSize: 14, marginTop: 4 }}>
            共 <strong>{total}</strong> 筆提交記錄
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="card" style={{ padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Search size={16} color="var(--text-3)" style={{ flexShrink: 0 }} />
        <select
          className="input"
          value={selectedFormId}
          onChange={e => setSelectedFormId(e.target.value)}
          style={{ maxWidth: 280, marginBottom: 0 }}
        >
          <option value="">全部表單</option>
          {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
        </select>
        {selectedFormId && (
          <button className="btn btn-ghost btn-sm" onClick={() => setSelectedFormId('')}>
            <X size={14} /> 清除
          </button>
        )}
        {selectedFormId && (
          <button className="btn btn-secondary btn-sm" onClick={exportBulkCsv} style={{ marginLeft: 'auto' }}>
            <Download size={14} /> 匯出全部 CSV
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)' }}>載入中...</div>
        ) : submissions.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <FileText size={40} color="var(--text-3)" style={{ marginBottom: 10 }} />
            <p style={{ color: 'var(--text-2)' }}>尚無提交記錄</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                {['表單名稱', '提交者', '提交時間', 'CRM 狀態', '操作'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {submissions.map((s, i) => {
                const crm = CRM_STATUS[s.crm_sync_status] || CRM_STATUS.pending;
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : 'var(--surface-2)' }}>
                    <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 500 }}>{s.form_title || '未知表單'}</td>
                    <td style={{ padding: '14px 16px', fontSize: 14, color: 'var(--text-2)' }}>{s.submitter_name || '—'}</td>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-2)' }}>
                      {new Date(s.submitted_at).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 8px', borderRadius: 6, color: crm.color, background: crm.bg }}>
                        {crm.label}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setDetail(s)}>
                        <Eye size={14} /> 查看
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '16px', borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => fetchSubmissions(page - 1)}>
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>第 {page} / {totalPages} 頁</span>
            <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => fetchSubmissions(page + 1)}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detail && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }} onClick={e => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div className="card" style={{ width: '100%', maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{detail.form_title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
                  {detail.submitter_name} · {new Date(detail.submitted_at).toLocaleString('zh-TW')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={exportCsv}>
                  <Download size={14} /> 匯出
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setDetail(null)}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ overflow: 'auto', padding: 24 }}>
              {Object.keys(detail.data || {}).length === 0 ? (
                <p style={{ color: 'var(--text-3)', textAlign: 'center' }}>無資料</p>
              ) : (
                <div style={{ display: 'grid', gap: 14 }}>
                  {Object.entries(detail.data || {}).map(([key, value]) => (
                    <div key={key} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '12px 16px' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{key}</div>
                      {/* 圖片顯示 */}
                      {typeof value === 'string' && value.startsWith('/uploads/') ? (
                        <img src={`http://localhost:3001${value}`} alt={key} style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6, objectFit: 'contain' }} />
                      ) : typeof value === 'string' && value.startsWith('data:image/') ? (
                        <img src={value} alt={key} style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6, border: '1px solid var(--border)' }} />
                      ) : Array.isArray(value) ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {value.map((v, i) => <span key={i} style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '2px 8px', borderRadius: 4, fontSize: 13 }}>{v}</span>)}
                        </div>
                      ) : (
                        <div style={{ fontSize: 14, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{String(value || '—')}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
