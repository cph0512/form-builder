import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  RefreshCw, RotateCcw, XCircle, Loader,
  CheckCircle, Clock, AlertTriangle, Play,
} from 'lucide-react';
import { useAuthStore } from '../store';

const STATUS_CFG = {
  pending:   { label: '等待中', color: '#f59e0b', bg: '#fef3c7', icon: Clock },
  running:   { label: '執行中', color: '#3b82f6', bg: '#dbeafe', icon: Play },
  success:   { label: '成功',   color: '#10b981', bg: '#d1fae5', icon: CheckCircle },
  failed:    { label: '失敗',   color: '#ef4444', bg: '#fee2e2', icon: AlertTriangle },
  cancelled: { label: '已取消', color: '#6b7280', bg: '#f3f4f6', icon: XCircle },
};
const LIMIT = 20;

export default function CrmJobsPage() {
  const { user } = useAuthStore();
  const canManageJobs = ['super_admin', 'dept_admin'].includes(user?.role);
  const [jobs,   setJobs]   = useState([]);
  const [stats,  setStats]  = useState({ pending: 0, running: 0, success: 0, failed: 0, cancelled: 0 });
  const [filter, setFilter] = useState('');
  const [page,   setPage]   = useState(1);
  const [total,  setTotal]  = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [actionId,  setActionId]  = useState(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (filter) params.set('status', filter);
      const [jobsRes, statsRes] = await Promise.all([
        axios.get(`/api/crm/jobs?${params}`),
        axios.get('/api/crm/jobs/stats'),
      ]);
      setJobs(jobsRes.data.data);
      setTotal(jobsRes.data.total);
      setStats(statsRes.data);
    } catch {
      toast.error('載入任務列表失敗');
    } finally {
      setIsLoading(false);
    }
  }, [page, filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* 每 30 秒自動刷新 */
  useEffect(() => {
    const t = setInterval(fetchData, 30_000);
    return () => clearInterval(t);
  }, [fetchData]);

  const handleRetry = async (id) => {
    setActionId(id);
    try {
      await axios.post(`/api/crm/jobs/${id}/retry`);
      toast.success('已加入重試佇列');
      fetchData();
    } catch { toast.error('重試失敗'); }
    finally { setActionId(null); }
  };

  const handleCancel = async (id) => {
    setActionId(id);
    try {
      await axios.post(`/api/crm/jobs/${id}/cancel`);
      toast.success('任務已取消');
      fetchData();
    } catch { toast.error('取消失敗'); }
    finally { setActionId(null); }
  };

  const fmt = (t) => t
    ? new Date(t).toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>CRM 任務監控</h1>
          <p style={{ color: 'var(--text-2)', fontSize: 14 }}>
            查看 CRM 自動寫入任務的執行狀態，並手動重試失敗任務
          </p>
        </div>
        <button className="btn btn-ghost" onClick={fetchData} disabled={isLoading}>
          <RefreshCw size={15} style={isLoading ? { animation: 'spin 1s linear infinite' } : {}} />
          重新整理
        </button>
      </div>

      {/* Stats — 可點擊篩選 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 28 }}>
        {Object.entries(STATUS_CFG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          const isActive = filter === key;
          return (
            <button key={key}
              onClick={() => { setFilter(isActive ? '' : key); setPage(1); }}
              className="card"
              style={{
                padding: '14px 16px', textAlign: 'left', cursor: 'pointer',
                border: 'none', fontFamily: 'inherit',
                outline: isActive ? `2px solid ${cfg.color}` : 'none',
                transition: 'all 0.15s',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: cfg.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={14} color={cfg.color} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{stats[key] ?? 0}</div>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>

        {/* Table header bar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>任務列表</span>
          {filter && (
            <span style={{
              fontSize: 12, padding: '2px 10px', borderRadius: 20,
              background: STATUS_CFG[filter]?.bg, color: STATUS_CFG[filter]?.color,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              篩選：{STATUS_CFG[filter]?.label}
              <button onClick={() => setFilter('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'inherit', lineHeight: 1, padding: 0 }}>
                ×
              </button>
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-2)' }}>共 {total} 筆</span>
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <Loader size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
          </div>
        ) : jobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-2)', fontSize: 14 }}>
            {filter
              ? `目前沒有「${STATUS_CFG[filter]?.label}」的任務`
              : '尚無任何 CRM 寫入任務'}
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 180px 90px 72px 130px 130px 80px',
              gap: 16, padding: '10px 20px',
              background: 'var(--surface-2)',
              fontSize: 12, fontWeight: 600, color: 'var(--text-2)',
            }}>
              <div>表單</div>
              <div>CRM 連線</div>
              <div>狀態</div>
              <div style={{ textAlign: 'center' }}>重試</div>
              <div>建立時間</div>
              <div>完成時間</div>
              <div></div>
            </div>

            {/* Rows */}
            {jobs.map(job => {
              const cfg = STATUS_CFG[job.status] || STATUS_CFG.pending;
              const Icon = cfg.icon;
              const isActing = actionId === job.id;
              return (
                <div key={job.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 180px 90px 72px 130px 130px 80px',
                  gap: 16, padding: '12px 20px',
                  borderTop: '1px solid var(--border)',
                  alignItems: 'center', fontSize: 14,
                }}>
                  {/* 表單 + 錯誤訊息 */}
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {job.form_title || '（未知表單）'}
                    </div>
                    {job.error_message && (
                      <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={job.error_message}>
                        {job.error_message}
                      </div>
                    )}
                  </div>

                  {/* CRM 名稱 */}
                  <div style={{ fontSize: 13, color: 'var(--text-2)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {job.crm_name || '—'}
                  </div>

                  {/* 狀態 badge */}
                  <div>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 12, fontWeight: 600, padding: '3px 8px',
                      borderRadius: 20, background: cfg.bg, color: cfg.color,
                    }}>
                      <Icon size={11} /> {cfg.label}
                    </span>
                  </div>

                  {/* 重試次數 */}
                  <div style={{ color: 'var(--text-2)', fontSize: 13, textAlign: 'center' }}>
                    {job.retry_count} / {job.max_retries}
                  </div>

                  {/* 時間 */}
                  <div style={{ color: 'var(--text-2)', fontSize: 12 }}>{fmt(job.created_at)}</div>
                  <div style={{ color: 'var(--text-2)', fontSize: 12 }}>{fmt(job.completed_at)}</div>

                  {/* Actions（僅 super_admin / dept_admin 可操作）*/}
                  <div style={{ display: 'flex', gap: 4 }}>
                    {canManageJobs && job.status === 'failed' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => handleRetry(job.id)}
                        disabled={isActing} title="重試" style={{ padding: '5px 8px' }}>
                        {isActing
                          ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
                          : <RotateCcw size={13} />}
                      </button>
                    )}
                    {canManageJobs && job.status === 'pending' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => handleCancel(job.id)}
                        disabled={isActing} title="取消"
                        style={{ padding: '5px 8px', color: 'var(--danger)' }}>
                        {isActing
                          ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
                          : <XCircle size={13} />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center',
                gap: 10, padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-ghost btn-sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                  上一頁
                </button>
                <span style={{ fontSize: 14, color: 'var(--text-2)' }}>
                  第 {page} / {totalPages} 頁
                </span>
                <button className="btn btn-ghost btn-sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  下一頁
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
