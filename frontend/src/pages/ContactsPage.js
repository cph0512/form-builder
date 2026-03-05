import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Search, Camera, Upload, Star, StarOff, Edit2, Trash2, RefreshCw,
  Plus, X, ChevronDown, ChevronUp, Globe, Phone, Mail, Building2,
  User, MapPin, Save, Loader, AlertTriangle, Download,
} from 'lucide-react';

// ─── 常數 ──────────────────────────────────────────────────────────────────────
const CRM_STATUS = {
  not_synced: { label: '未同步', color: '#94a3b8', bg: '#f8fafc' },
  pending:    { label: '同步中', color: '#f59e0b', bg: '#fffbeb' },
  synced:     { label: '已同步', color: '#10b981', bg: '#ecfdf5' },
  error:      { label: '同步失敗', color: '#ef4444', bg: '#fef2f2' },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  主頁面
// ═══════════════════════════════════════════════════════════════════════════════
export default function ContactsPage() {
  const [tab, setTab] = useState('list');
  const [categories, setCategories] = useState([]);

  const loadCats = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/contacts/categories');
      setCategories(data);
    } catch {}
  }, []);

  useEffect(() => { loadCats(); }, [loadCats]);

  return (
    <div style={{ padding: 'clamp(16px, 3vw, 28px) clamp(12px, 3vw, 32px)', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 'clamp(18px, 4vw, 22px)', fontWeight: 700, color: '#0f172a', margin: 0 }}>
          📇 名片通訊錄
        </h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
          掃描名片自動辨識、建立聯絡人、同步到 CRM
        </p>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}>
        {[['list', '📋 聯絡人列表'], ['scan', '📷 掃描名片'], ['categories', '🏷️ 分類管理']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '9px 16px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
            borderBottom: tab === key ? '2px solid #3b82f6' : '2px solid transparent',
            color: tab === key ? '#3b82f6' : '#64748b', background: 'transparent', marginBottom: -1,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>{label}</button>
        ))}
      </div>

      {tab === 'list' && <ListTab categories={categories} />}
      {tab === 'scan' && <ScanTab categories={categories} onSaved={() => setTab('list')} />}
      {tab === 'categories' && <CategoriesTab categories={categories} reload={loadCats} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Tab 1: 聯絡人列表
// ═══════════════════════════════════════════════════════════════════════════════
function ListTab({ categories }) {
  const [items, setItems]       = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [q, setQ]               = useState('');
  const [catFilter, setCat]     = useState('');
  const [favOnly, setFavOnly]   = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing]   = useState(null);
  const [editForm, setEditForm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = { q, limit: 100 };
      if (catFilter) params.category_id = catFilter;
      if (favOnly) params.favorite = 'true';
      const { data } = await axios.get('/api/contacts', { params });
      setItems(data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally { setLoading(false); }
  }, [q, catFilter, favOnly]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!window.confirm('確定要刪除這位聯絡人？')) return;
    try {
      await axios.delete(`/api/contacts/${id}`);
      setItems(prev => prev.filter(i => i.id !== id));
      toast.success('已刪除');
    } catch { toast.error('刪除失敗'); }
  };

  const toggleFav = async (id) => {
    try {
      const { data } = await axios.post(`/api/contacts/${id}/favorite`);
      setItems(prev => prev.map(i => i.id === id ? { ...i, is_favorite: data.is_favorite } : i));
    } catch {}
  };

  const startEdit = (item) => {
    setEditing(item.id);
    setEditForm({
      full_name: item.full_name || '', company: item.company || '', job_title: item.job_title || '',
      emails: item.emails || [], phones: item.phones || [],
      address: item.address || '', website: item.website || '',
      category_id: item.category_id || '', notes: item.notes || '',
    });
  };

  const saveEdit = async () => {
    try {
      await axios.put(`/api/contacts/${editing}`, editForm);
      setEditing(null);
      load();
      toast.success('已更新');
    } catch { toast.error('更新失敗'); }
  };

  const getPrimaryValue = (arr, field = 'value') => {
    if (!Array.isArray(arr) || arr.length === 0) return '';
    const primary = arr.find(i => i.is_primary);
    return (primary || arr[0])?.[field] || '';
  };

  return (
    <div>
      {/* 搜尋列 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 200px', minWidth: 0, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="搜尋姓名、公司、職稱..."
            style={{ ...inputStyle, paddingLeft: 34, width: '100%' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={catFilter} onChange={e => setCat(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 100 }}>
            <option value="">全部分類</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={() => setFavOnly(!favOnly)} style={{
            ...btnStyle, background: favOnly ? '#fef3c7' : '#f1f5f9', color: favOnly ? '#d97706' : '#64748b',
          }}>
            <Star size={14} fill={favOnly ? '#d97706' : 'none'} /> 收藏
          </button>
          <button onClick={() => { window.open('/api/contacts/export/csv', '_blank'); }}
            style={{ ...btnStyle, background: '#f1f5f9', color: '#64748b' }}>
            <Download size={14} /> 匯出
          </button>
          <span style={{ fontSize: 13, color: '#94a3b8' }}>共 {total} 位</span>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={18} color="#dc2626" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#dc2626' }}>載入失敗</div>
            <div style={{ fontSize: 12, color: '#ef4444' }}>{error}</div>
          </div>
          <button onClick={load} style={{ ...btnStyle, background: '#3b82f6', color: '#fff' }}>重試</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
          <Loader size={24} style={{ animation: 'spin 1s linear infinite' }} /> 載入中...
        </div>
      ) : items.length === 0 && !error ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
          <User size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
          <p style={{ fontSize: 15 }}>通訊錄是空的</p>
          <p style={{ fontSize: 13 }}>前往「掃描名片」上傳名片，或手動新增聯絡人</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 14 }}>
          {items.map(item => (
            <div key={item.id} style={{
              border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px',
              background: '#fff', transition: 'box-shadow 0.15s',
              boxShadow: expanded === item.id ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: item.category_color || '#e2e8f0', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 700, flexShrink: 0,
                }}>
                  {(item.full_name || item.company || '?')[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.full_name || '（未命名）'}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[item.company, item.job_title].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <button onClick={() => toggleFav(item.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2 }}>
                  {item.is_favorite
                    ? <Star size={16} fill="#f59e0b" color="#f59e0b" />
                    : <StarOff size={16} color="#cbd5e1" />}
                </button>
              </div>

              {/* Quick info */}
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {getPrimaryValue(item.emails) && (
                  <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 3, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <Mail size={11} style={{ flexShrink: 0 }} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getPrimaryValue(item.emails)}</span>
                  </span>
                )}
                {getPrimaryValue(item.phones) && (
                  <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Phone size={11} style={{ flexShrink: 0 }} /> {getPrimaryValue(item.phones)}
                  </span>
                )}
              </div>

              {/* Badges */}
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {item.category_name && (
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 999,
                    background: (item.category_color || '#6b7280') + '18',
                    color: item.category_color || '#6b7280', fontWeight: 600,
                  }}>{item.category_name}</span>
                )}
                {item.crm_sync_status && CRM_STATUS[item.crm_sync_status] && (
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 999,
                    background: CRM_STATUS[item.crm_sync_status].bg,
                    color: CRM_STATUS[item.crm_sync_status].color, fontWeight: 500,
                  }}>{CRM_STATUS[item.crm_sync_status].label}</span>
                )}
                {item.source_type === 'scan' && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#eff6ff', color: '#3b82f6' }}>📷 掃描</span>
                )}
              </div>

              {/* Actions */}
              <div style={{ marginTop: 10, display: 'flex', gap: 6, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
                <button onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                  style={{ ...smBtn, flex: 1 }}>
                  {expanded === item.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {expanded === item.id ? '收起' : '展開'}
                </button>
                <button onClick={() => startEdit(item)} style={smBtn}><Edit2 size={13} /> 編輯</button>
                <button onClick={() => handleDelete(item.id)} style={{ ...smBtn, color: '#ef4444' }}><Trash2 size={13} /></button>
              </div>

              {/* Expanded detail */}
              {expanded === item.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9', fontSize: 13 }}>
                  {item.address && <div style={{ marginBottom: 6, display: 'flex', gap: 6 }}><MapPin size={14} color="#94a3b8" style={{ flexShrink: 0, marginTop: 2 }} /><span>{item.address}</span></div>}
                  {item.website && <div style={{ marginBottom: 6, display: 'flex', gap: 6 }}><Globe size={14} color="#94a3b8" style={{ flexShrink: 0, marginTop: 2 }} /><a href={item.website} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', wordBreak: 'break-all' }}>{item.website}</a></div>}
                  {(item.emails || []).length > 1 && (
                    <div style={{ marginBottom: 6 }}>
                      <strong>所有 Email：</strong>
                      {item.emails.map((e, i) => <div key={i} style={{ marginLeft: 20, fontSize: 12 }}>{e.value} ({e.label})</div>)}
                    </div>
                  )}
                  {(item.phones || []).length > 1 && (
                    <div style={{ marginBottom: 6 }}>
                      <strong>所有電話：</strong>
                      {item.phones.map((p, i) => <div key={i} style={{ marginLeft: 20, fontSize: 12 }}>{p.value} ({p.label})</div>)}
                    </div>
                  )}
                  {item.notes && <div style={{ marginTop: 6, color: '#64748b', whiteSpace: 'pre-wrap' }}>{item.notes}</div>}
                  {item.source_image_url && (
                    <div style={{ marginTop: 8 }}>
                      <img src={item.source_image_url} alt="名片" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    </div>
                  )}
                </div>
              )}

              {/* Edit inline */}
              {editing === item.id && editForm && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '2px solid #3b82f6', fontSize: 13 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                    <input value={editForm.full_name} onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                      placeholder="姓名" style={inputStyle} />
                    <input value={editForm.company} onChange={e => setEditForm({ ...editForm, company: e.target.value })}
                      placeholder="公司" style={inputStyle} />
                    <input value={editForm.job_title} onChange={e => setEditForm({ ...editForm, job_title: e.target.value })}
                      placeholder="職稱" style={inputStyle} />
                    <select value={editForm.category_id} onChange={e => setEditForm({ ...editForm, category_id: e.target.value })} style={inputStyle}>
                      <option value="">選擇分類</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                    placeholder="備註" rows={2} style={{ ...inputStyle, marginTop: 8, width: '100%' }} />
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => setEditing(null)} style={smBtn}>取消</button>
                    <button onClick={saveEdit} style={{ ...smBtn, background: '#3b82f6', color: '#fff' }}>
                      <Save size={13} /> 儲存
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Tab 2: 掃描名片
// ═══════════════════════════════════════════════════════════════════════════════
function ScanTab({ categories, onSaved }) {
  const [mode, setMode]         = useState('upload'); // upload | camera | manual
  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult]     = useState(null);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState(null);
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const fileRef   = useRef(null);

  // 相機啟動
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setMode('camera');
    } catch (err) {
      toast.error('無法存取相機：' + err.message);
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      const f = new File([blob], 'card_capture.jpg', { type: 'image/jpeg' });
      setFile(f);
      setPreview(URL.createObjectURL(blob));
      stopCamera();
      setMode('upload');
    }, 'image/jpeg', 0.92);
  };

  useEffect(() => { return () => stopCamera(); }, []);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setForm(null);
  };

  // 送 AI 辨識
  const handleScan = async () => {
    if (!file) return;
    setScanning(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await axios.post('/api/contacts/scan', fd);
      setResult(data);
      // 建立可編輯表單
      const c = data.parsed || {};
      const catMatch = categories.find(cat => cat.name === data.suggested_category);
      setForm({
        full_name:   c.full_name || '',
        first_name:  c.first_name || '',
        last_name:   c.last_name || '',
        company:     c.company || '',
        job_title:   c.job_title || '',
        department:  c.department || '',
        emails:      c.emails || [{ value: '', label: '工作', is_primary: true }],
        phones:      c.phones || [{ value: '', label: '手機', is_primary: true }],
        address:     c.address || '',
        website:     c.website || '',
        category_id: catMatch?.id || '',
        notes:       data.notes || '',
        tags:        [],
      });
    } catch (err) {
      toast.error('辨識失敗：' + (err.response?.data?.error || err.message));
    } finally {
      setScanning(false);
    }
  };

  // 儲存聯絡人
  const handleSave = async () => {
    if (!form) return;
    if (!form.full_name && !form.company) {
      toast.error('姓名或公司至少填一個');
      return;
    }
    setSaving(true);
    try {
      await axios.post('/api/contacts', {
        ...form,
        source_type: result ? 'scan' : 'manual',
        source_image_url: result?.image_url || null,
        ai_raw_result: result?.raw_result || null,
        ai_confidence: result?.confidence || null,
        ai_suggested_category: result?.suggested_category || null,
      });
      toast.success('聯絡人已儲存！');
      setFile(null); setPreview(''); setResult(null); setForm(null);
      onSaved();
    } catch (err) {
      toast.error('儲存失敗：' + (err.response?.data?.error || err.message));
    } finally { setSaving(false); }
  };

  // 手動新增（不掃描）
  const handleManualAdd = () => {
    stopCamera();
    setResult(null);
    setFile(null);
    setPreview('');
    setForm({
      full_name: '', first_name: '', last_name: '', company: '', job_title: '', department: '',
      emails: [{ value: '', label: '工作', is_primary: true }],
      phones: [{ value: '', label: '手機', is_primary: true }],
      address: '', website: '', category_id: '', notes: '', tags: [],
    });
  };

  return (
    <div>
      {!form ? (
        <>
          {/* 模式選擇 - 響應式 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
            <button onClick={() => { setMode('upload'); stopCamera(); }}
              style={{ ...modeBtn, ...(mode === 'upload' ? modeBtnActive : {}) }}>
              <Upload size={20} />
              <span>選擇圖片</span>
            </button>
            <button onClick={startCamera}
              style={{ ...modeBtn, ...(mode === 'camera' ? modeBtnActive : {}) }}>
              <Camera size={20} />
              <span>拍照</span>
            </button>
            <button onClick={handleManualAdd} style={modeBtn}>
              <Plus size={20} />
              <span>手動新增</span>
            </button>
          </div>

          {/* 相機預覽 */}
          {mode === 'camera' && (
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <video ref={videoRef} autoPlay playsInline
                style={{ width: '100%', maxWidth: 500, borderRadius: 12, border: '2px solid #e2e8f0' }} />
              <div style={{ marginTop: 12 }}>
                <button onClick={capturePhoto} style={{
                  padding: '12px 32px', fontSize: 16, fontWeight: 600, borderRadius: 999,
                  background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer',
                }}>📸 拍攝</button>
              </div>
            </div>
          )}

          {/* 上傳區域 */}
          {mode === 'upload' && !preview && (
            <label style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              border: '2px dashed #cbd5e1', borderRadius: 16, padding: 'clamp(24px, 5vw, 48px) 20px', cursor: 'pointer',
              background: '#fafbfc', transition: 'border-color 0.2s',
            }}>
              <Upload size={36} color="#94a3b8" style={{ marginBottom: 12 }} />
              <p style={{ fontSize: 14, color: '#64748b', margin: 0, textAlign: 'center' }}>點擊選擇名片圖片</p>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '6px 0 0', textAlign: 'center' }}>JPG、PNG、WebP、HEIC（最大 20MB）</p>
              <input ref={fileRef} type="file" accept="image/*" capture="environment"
                onChange={handleFileChange} style={{ display: 'none' }} />
            </label>
          )}

          {/* 預覽 + 掃描按鈕 */}
          {preview && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
                <img src={preview} alt="名片預覽"
                  style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 12, border: '1px solid #e2e8f0' }} />
                <button onClick={() => { setFile(null); setPreview(''); }}
                  style={{
                    position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}><X size={14} /></button>
              </div>
              <div style={{ marginTop: 16 }}>
                <button onClick={handleScan} disabled={scanning} style={{
                  padding: '12px 36px', fontSize: 15, fontWeight: 600, borderRadius: 10,
                  background: scanning ? '#94a3b8' : '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer',
                  width: '100%', maxWidth: 300,
                }}>
                  {scanning ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite', marginRight: 6 }} />AI 辨識中...</> : '🔍 開始辨識'}
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        /* 辨識結果 / 手動新增 表單 */
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          {result && (
            <div style={{
              display: 'flex', gap: 12, marginBottom: 20, padding: '12px 16px', borderRadius: 10,
              background: result.confidence >= 0.8 ? '#ecfdf5' : result.confidence >= 0.5 ? '#fffbeb' : '#fef2f2',
              flexWrap: 'wrap',
            }}>
              <div style={{ fontSize: 13 }}>
                <strong>AI 辨識信心度：</strong>{Math.round((result.confidence || 0) * 100)}%
                {result.notes && <span style={{ marginLeft: 8, color: '#64748b' }}>— {result.notes}</span>}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
            <FormField label="姓名 *" value={form.full_name} onChange={v => setForm({ ...form, full_name: v })} />
            <FormField label="公司" value={form.company} onChange={v => setForm({ ...form, company: v })} icon={<Building2 size={14} />} />
            <FormField label="職稱" value={form.job_title} onChange={v => setForm({ ...form, job_title: v })} />
            <FormField label="部門" value={form.department} onChange={v => setForm({ ...form, department: v })} />
          </div>

          {/* Email 列表 */}
          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' }}>
              <Mail size={14} style={{ verticalAlign: -2 }} /> Email
            </label>
            {form.emails.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input value={e.value} onChange={ev => {
                  const arr = [...form.emails]; arr[i] = { ...arr[i], value: ev.target.value };
                  setForm({ ...form, emails: arr });
                }} placeholder="email@example.com" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                <input value={e.label} onChange={ev => {
                  const arr = [...form.emails]; arr[i] = { ...arr[i], label: ev.target.value };
                  setForm({ ...form, emails: arr });
                }} placeholder="標籤" style={{ ...inputStyle, width: 60 }} />
                <button onClick={() => setForm({ ...form, emails: form.emails.filter((_, j) => j !== i) })}
                  style={smBtn}><X size={13} /></button>
              </div>
            ))}
            <button onClick={() => setForm({ ...form, emails: [...form.emails, { value: '', label: '其他', is_primary: false }] })}
              style={{ ...smBtn, color: '#3b82f6', fontSize: 12 }}>+ 新增 Email</button>
          </div>

          {/* Phone 列表 */}
          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' }}>
              <Phone size={14} style={{ verticalAlign: -2 }} /> 電話
            </label>
            {form.phones.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input value={p.value} onChange={ev => {
                  const arr = [...form.phones]; arr[i] = { ...arr[i], value: ev.target.value };
                  setForm({ ...form, phones: arr });
                }} placeholder="0912-345-678" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                <input value={p.label} onChange={ev => {
                  const arr = [...form.phones]; arr[i] = { ...arr[i], label: ev.target.value };
                  setForm({ ...form, phones: arr });
                }} placeholder="標籤" style={{ ...inputStyle, width: 60 }} />
                <button onClick={() => setForm({ ...form, phones: form.phones.filter((_, j) => j !== i) })}
                  style={smBtn}><X size={13} /></button>
              </div>
            ))}
            <button onClick={() => setForm({ ...form, phones: [...form.phones, { value: '', label: '其他', is_primary: false }] })}
              style={{ ...smBtn, color: '#3b82f6', fontSize: 12 }}>+ 新增電話</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12, marginTop: 16 }}>
            <FormField label="地址" value={form.address} onChange={v => setForm({ ...form, address: v })} icon={<MapPin size={14} />} />
            <FormField label="網站" value={form.website} onChange={v => setForm({ ...form, website: v })} icon={<Globe size={14} />} />
          </div>

          {/* 分類 */}
          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' }}>分類</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {categories.map(cat => (
                <button key={cat.id} onClick={() => setForm({ ...form, category_id: cat.id })}
                  style={{
                    padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    border: form.category_id === cat.id ? `2px solid ${cat.color}` : '1px solid #e2e8f0',
                    background: form.category_id === cat.id ? cat.color + '18' : '#fff',
                    color: form.category_id === cat.id ? cat.color : '#64748b',
                  }}>{cat.name}</button>
              ))}
            </div>
            {result?.suggested_category && (
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                💡 AI 建議分類：<strong>{result.suggested_category}</strong>
              </div>
            )}
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' }}>備註</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={3} style={{ ...inputStyle, width: '100%' }} placeholder="任何附加說明..." />
          </div>

          <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button onClick={() => { setForm(null); setResult(null); }}
              style={{ ...btnStyle, background: '#f1f5f9', color: '#64748b' }}>
              <X size={16} /> 取消
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ ...btnStyle, background: '#3b82f6', color: '#fff', opacity: saving ? 0.7 : 1 }}>
              {saving ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
              儲存聯絡人
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Tab 3: 分類管理
// ═══════════════════════════════════════════════════════════════════════════════
function CategoriesTab({ categories, reload }) {
  const [form, setForm] = useState({ name: '', color: '#6b7280' });
  const [editId, setEditId] = useState(null);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899', '#6b7280', '#0ea5e9'];

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('名稱必填');
    try {
      if (editId) {
        await axios.put(`/api/contacts/categories/${editId}`, form);
        toast.success('分類已更新');
      } else {
        await axios.post('/api/contacts/categories', form);
        toast.success('分類已建立');
      }
      setForm({ name: '', color: '#6b7280' });
      setEditId(null);
      reload();
    } catch (err) {
      toast.error(err.response?.data?.error || '操作失敗');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('確定刪除此分類？')) return;
    try {
      await axios.delete(`/api/contacts/categories/${id}`);
      toast.success('已刪除');
      reload();
    } catch { toast.error('刪除失敗'); }
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
        自訂聯絡人分類，掃描名片時 AI 會自動建議分類
      </p>

      {/* 新增/編輯表單 */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 24, padding: 16,
        background: '#f8fafc', borderRadius: 12, flexWrap: 'wrap', alignItems: 'flex-end',
      }}>
        <div style={{ flex: '1 1 150px', minWidth: 0 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
            分類名稱
          </label>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="例如：VIP 客戶" style={inputStyle} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>顏色</label>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => setForm({ ...form, color: c })} style={{
                width: 24, height: 24, borderRadius: '50%', background: c, border: form.color === c ? '3px solid #0f172a' : '2px solid #e2e8f0',
                cursor: 'pointer', padding: 0,
              }} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={handleSave} style={{ ...btnStyle, background: '#3b82f6', color: '#fff', whiteSpace: 'nowrap' }}>
            {editId ? '更新' : '新增'}
          </button>
          {editId && (
            <button onClick={() => { setEditId(null); setForm({ name: '', color: '#6b7280' }); }}
              style={{ ...btnStyle, background: '#f1f5f9' }}>取消</button>
          )}
        </div>
      </div>

      {/* 分類列表 */}
      {categories.map(cat => (
        <div key={cat.id} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
          borderBottom: '1px solid #f1f5f9',
        }}>
          <div style={{
            width: 16, height: 16, borderRadius: '50%', background: cat.color, flexShrink: 0,
          }} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{cat.name}</span>
          <button onClick={() => { setEditId(cat.id); setForm({ name: cat.name, color: cat.color }); }}
            style={smBtn}><Edit2 size={13} /></button>
          <button onClick={() => handleDelete(cat.id)}
            style={{ ...smBtn, color: '#ef4444' }}><Trash2 size={13} /></button>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  小元件
// ═══════════════════════════════════════════════════════════════════════════════
function FormField({ label, value, onChange, icon }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        {icon}{label}
      </label>
      <input value={value || ''} onChange={e => onChange(e.target.value)} style={inputStyle} />
    </div>
  );
}

// ─── 共用樣式 ──────────────────────────────────────────────────────────────────
const inputStyle = {
  padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14,
  outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit',
};
const btnStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
  fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer',
};
const smBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px',
  fontSize: 12, fontWeight: 500, borderRadius: 6, border: '1px solid #e2e8f0',
  background: '#fff', cursor: 'pointer', color: '#64748b',
};
const modeBtn = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  gap: 6, padding: '16px 12px',
  fontSize: 13, fontWeight: 600, borderRadius: 12, border: '1px solid #e2e8f0',
  background: '#fff', cursor: 'pointer', color: '#64748b', textAlign: 'center',
};
const modeBtnActive = {
  background: '#eff6ff', color: '#3b82f6', borderColor: '#3b82f6',
};
