import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useFormStore, useAuthStore } from '../store';
import { PlusCircle, FileText, Edit2, Eye, Clock, ToggleLeft, ToggleRight, TrendingUp, Send, Calendar, CheckCircle, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DashboardPage() {
  const { forms, isLoading, fetchForms, toggleFormStatus } = useFormStore();
  const { user } = useAuthStore();
  const canCreate = ['super_admin', 'dept_admin'].includes(user?.role);
  const [stats, setStats] = useState(null);
  const [chartPeriod, setChartPeriod] = useState('7d');

  const handleToggle = async (form) => {
    try {
      const res = await toggleFormStatus(form.id);
      toast.success(`表單已${res.is_active ? '啟用' : '停用'}`);
    } catch {
      toast.error('操作失敗，請重試');
    }
  };

  useEffect(() => {
    fetchForms();
    axios.get('/api/submissions/stats')
      .then(res => setStats(res.data))
      .catch(() => {}); // 統計失敗不影響主功能
  }, []);

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>表單管理</h1>
          <p style={{ color: 'var(--text-2)', fontSize: 14, marginTop: 4 }}>管理所有客戶資料收集表單</p>
        </div>
        {canCreate && (
          <Link to="/builder/new" className="btn btn-primary">
            <PlusCircle size={16} /> 新增表單
          </Link>
        )}
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: '表單總數', value: forms.length, color: '#1a56db', icon: <FileText size={18} /> },
          { label: '啟用中', value: forms.filter(f => f.is_active).length, color: '#10b981', icon: <Eye size={18} /> },
          { label: '已停用', value: forms.filter(f => !f.is_active).length, color: '#94a3b8', icon: <ToggleLeft size={18} /> },
          { label: '總提交數', value: stats?.total ?? '—', color: '#8b5cf6', icon: <Send size={18} /> },
          { label: '今日提交', value: stats?.today ?? '—', color: '#f59e0b', icon: <Calendar size={18} /> },
        ].map(stat => (
          <div key={stat.label} className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 26, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{stat.label}</div>
              </div>
              <div style={{ color: stat.color, opacity: 0.6 }}>{stat.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* CRM Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 28, maxWidth: '50%' }}>
          {[
            { label: 'CRM 寫入成功', value: stats.crm?.success ?? '—', color: '#10b981', icon: <CheckCircle size={18} /> },
            { label: 'CRM 寫入失敗', value: stats.crm?.failed ?? '—', color: '#ef4444', icon: <AlertCircle size={18} /> },
          ].map(stat => (
            <div key={stat.label} className="card" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{stat.label}</div>
                </div>
                <div style={{ color: stat.color, opacity: 0.6 }}>{stat.icon}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Charts Row */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
          {/* Trend Bar Chart with period toggle */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={16} color="var(--primary)" />
                <span style={{ fontSize: 14, fontWeight: 700 }}>
                  {chartPeriod === '7d' ? '近 7 天提交趨勢' : '近 30 天提交趨勢'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[{ key: '7d', label: '7天' }, { key: '30d', label: '30天' }].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setChartPeriod(key)}
                    className={`btn btn-sm ${chartPeriod === key ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '3px 10px', fontSize: 12 }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {(() => {
              const chartData = chartPeriod === '7d' ? (stats.weekly || []) : (stats.monthly || []);
              const chartMax = chartData.reduce((m, d) => Math.max(m, d.count), 1);
              return chartData.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: '20px 0', fontSize: 13 }}>尚無資料</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: chartPeriod === '30d' ? 2 : 6, height: 80 }}>
                  {chartData.map(d => (
                    <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
                      title={`${d.date}: ${d.count} 筆`}>
                      {chartPeriod === '7d' && (
                        <div style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 700 }}>{d.count}</div>
                      )}
                      <div style={{
                        width: '100%', borderRadius: '3px 3px 0 0',
                        background: 'var(--primary)', opacity: 0.8,
                        height: `${Math.max(2, (d.count / chartMax) * 60)}px`,
                        transition: 'height 0.3s',
                      }} />
                      {chartPeriod === '7d' && (
                        <div style={{ fontSize: 9, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                          {new Date(d.date + 'T00:00:00').toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Top Forms */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>熱門表單（提交數）</div>
            {stats.byForm.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: '20px 0', fontSize: 13 }}>尚無資料</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {stats.byForm.map((f, i) => {
                  const maxCount = stats.byForm[0]?.count || 1;
                  return (
                    <div key={f.form_id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                        <span style={{ color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{f.title}</span>
                        <span style={{ color: 'var(--text-2)', fontWeight: 700, flexShrink: 0 }}>{f.count}</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 3 }}>
                        <div style={{ height: '100%', background: `hsl(${220 + i * 30}, 80%, 60%)`, borderRadius: 3, width: `${(f.count / maxCount) * 100}%`, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Form List */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>所有表單</h2>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>載入中...</div>
      ) : forms.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <FileText size={48} color="var(--text-3)" style={{ marginBottom: 12 }} />
          <p style={{ color: 'var(--text-2)', fontSize: 15 }}>尚未建立任何表單</p>
          {canCreate && <Link to="/builder/new" className="btn btn-primary" style={{ marginTop: 16, display: 'inline-flex' }}>建立第一個表單</Link>}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {forms.map(form => (
            <div key={form.id} className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14, transition: 'box-shadow 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'var(--shadow-sm)'}
            >
              <div style={{ width: 40, height: 40, background: 'var(--primary-light)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileText size={18} color="var(--primary)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{form.title}</span>
                  <span className={`badge ${form.is_active ? 'badge-green' : 'badge-gray'}`}>
                    {form.is_active ? '啟用中' : '已停用'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 14, marginTop: 3, fontSize: 12, color: 'var(--text-2)' }}>
                  {form.description && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{form.description}</span>}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Clock size={11} /> {new Date(form.created_at).toLocaleDateString('zh-TW')}
                  </span>
                  {form.creator_name && <span>建立者：{form.creator_name}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {form.is_active && (
                  <Link to={`/fill/${form.id}`} className="btn btn-secondary btn-sm">
                    <Eye size={14} /> 填寫
                  </Link>
                )}
                {canCreate && (
                  <Link to={`/builder/${form.id}`} className="btn btn-primary btn-sm">
                    <Edit2 size={14} /> 編輯
                  </Link>
                )}
                {user?.role === 'super_admin' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => handleToggle(form)} title={form.is_active ? '停用表單' : '啟用表單'}>
                    {form.is_active ? <ToggleRight size={16} color="#10b981" /> : <ToggleLeft size={16} color="#94a3b8" />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
