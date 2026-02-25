import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const CATEGORIES = [
  { value: 'product',  label: '產品資訊', color: '#3b82f6', bg: '#eff6ff' },
  { value: 'price',    label: '價格方案', color: '#10b981', bg: '#ecfdf5' },
  { value: 'faq',      label: '常見問題', color: '#f59e0b', bg: '#fffbeb' },
  { value: 'policy',   label: '政策規範', color: '#8b5cf6', bg: '#f5f3ff' },
  { value: 'general',  label: '一般資訊', color: '#64748b', bg: '#f8fafc' },
];

const SOURCE_LABELS = {
  manual: '手動',
  image:  '圖片',
  csv:    'CSV',
  excel:  'Excel',
  pdf:    'PDF',
};

const catMap = Object.fromEntries(CATEGORIES.map(c => [c.value, c]));

const EMPTY_FORM = { title: '', content: '', category: 'general', tags: '' };

export default function KnowledgeBasePage() {
  const [tab, setTab] = useState('list');
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>📚 業務知識庫</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
          建立產品資訊、FAQ、政策等，LINE Bot 回答問題時會優先搜尋此知識庫
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #e2e8f0', paddingBottom: 0 }}>
        {[['list', '📋 知識庫列表'], ['add', '➕ 新增 / 匯入']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '9px 20px', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer',
              borderBottom: tab === key ? '2px solid #3b82f6' : '2px solid transparent',
              color: tab === key ? '#3b82f6' : '#64748b',
              background: 'transparent', marginBottom: -1,
            }}
          >{label}</button>
        ))}
      </div>

      {tab === 'list' ? <ListTab /> : <AddTab onSaved={() => setTab('list')} />}
    </div>
  );
}

// ─── 列表 Tab ──────────────────────────────────────────────────────────────────
function ListTab() {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadStatus, setLoadStatus] = useState(0);
  const [q, setQ]               = useState('');
  const [catFilter, setCat]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing]   = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    setLoadStatus(0);
    try {
      const { data } = await axios.get('/api/knowledge', { params: { q, category: catFilter } });
      setItems(data);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || '未知錯誤';
      const status = err.response?.status || 0;
      setLoadError(msg);
      setLoadStatus(status);
      console.error('[知識庫] 載入失敗:', msg, status);
    } finally { setLoading(false); }
  }, [q, catFilter]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!window.confirm('確定要刪除這筆知識庫條目？')) return;
    await axios.delete(`/api/knowledge/${id}`);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const startEdit = (item) => {
    setEditing(item.id);
    setEditForm({ title: item.title, content: item.content, category: item.category, tags: (item.tags || []).join(', ') });
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await axios.put(`/api/knowledge/${editing}`, {
        ...editForm,
        tags: editForm.tags.split(',').map(t => t.trim()).filter(Boolean),
      });
      setEditing(null);
      load();
    } finally { setSaving(false); }
  };

  return (
    <div>
      {/* 搜尋與篩選 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="搜尋標題或內容..."
          style={inputStyle}
        />
        <select value={catFilter} onChange={e => setCat(e.target.value)} style={{ ...inputStyle, maxWidth: 160 }}>
          <option value="">全部分類</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <span style={{ fontSize: 13, color: '#94a3b8', alignSelf: 'center', whiteSpace: 'nowrap' }}>
          共 {items.length} 筆
        </span>
      </div>

      {loadError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#dc2626' }}>載入失敗</div>
            <div style={{ fontSize: 12, color: '#ef4444', marginTop: 2 }}>{loadError}</div>
            {(loadError.includes('does not exist') || loadStatus === 500) && (
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.6 }}>
                💡 請先在 <strong>Supabase SQL Editor</strong> 執行 <strong>migration 008</strong>（建立 knowledge_base 資料表），再點「重試」
              </div>
            )}
          </div>
          <button onClick={load} style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            重試
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>載入中...</div>
      ) : items.length === 0 && !loadError ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div>知識庫是空的，請先新增條目</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(item => (
            <div key={item.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
              {editing === item.id ? (
                /* 編輯模式 */
                <div style={{ padding: 20 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={labelStyle}>標題 *</label>
                      <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>分類</label>
                      <select value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                        {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>標籤（逗號分隔）</label>
                    <input value={editForm.tags} onChange={e => setEditForm(f => ({ ...f, tags: e.target.value }))} placeholder="例：SUV, 電動車" style={inputStyle} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>內容 *</label>
                    <textarea value={editForm.content} onChange={e => setEditForm(f => ({ ...f, content: e.target.value }))} rows={6} style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={saveEdit} disabled={saving} style={btnStyle('#3b82f6')}>{saving ? '儲存中...' : '儲存'}</button>
                    <button onClick={() => setEditing(null)} style={btnStyle('#94a3b8')}>取消</button>
                  </div>
                </div>
              ) : (
                /* 顯示模式 */
                <div>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer' }}
                    onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                  >
                    <CategoryBadge cat={item.category} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.title}
                      </div>
                      {item.tags?.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                          {item.tags.map(t => (
                            <span key={t} style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', borderRadius: 4, padding: '1px 6px' }}>{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
                      {SOURCE_LABELS[item.source_type] || item.source_type} · {new Date(item.created_at).toLocaleDateString('zh-TW')}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={e => { e.stopPropagation(); startEdit(item); }} style={smallBtnStyle('#3b82f6')}>編輯</button>
                      <button onClick={e => { e.stopPropagation(); handleDelete(item.id); }} style={smallBtnStyle('#ef4444')}>刪除</button>
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>{expanded === item.id ? '▲' : '▼'}</span>
                  </div>
                  {expanded === item.id && (
                    <div style={{ padding: '0 18px 16px', borderTop: '1px solid #f1f5f9' }}>
                      <pre style={{ fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap', margin: '12px 0 0', fontFamily: 'inherit', lineHeight: 1.7 }}>
                        {item.content}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 新增 Tab ──────────────────────────────────────────────────────────────────
function AddTab({ onSaved }) {
  const [mode, setMode]     = useState('manual');
  const [form, setForm]     = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // 圖片解析狀態
  const [imgFile, setImgFile]       = useState(null);
  const [imgPreview, setImgPreview] = useState('');
  const [imgParsed, setImgParsed]   = useState('');
  const [imgParsing, setImgParsing] = useState(false);
  const [imgTitle, setImgTitle]     = useState('');

  // CSV/Excel/PDF 解析狀態
  const [fileItems, setFileItems]     = useState([]);
  const [fileChecked, setFileChecked] = useState({});
  const [fileParsing, setFileParsing] = useState(false);
  const [fileType, setFileType]       = useState('');
  const [pdfTitle, setPdfTitle]       = useState('');
  const [pdfContent, setPdfContent]   = useState('');
  const [fileCategory, setFileCategory] = useState('general');

  const imgInputRef  = useRef();
  const fileInputRef = useRef();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // 手動儲存
  const handleManualSave = async () => {
    if (!form.title.trim() || !form.content.trim()) return alert('請填寫標題和內容');
    setSaving(true);
    try {
      await axios.post('/api/knowledge', {
        ...form,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        source_type: 'manual',
      });
      setForm(EMPTY_FORM);
      alert('✅ 已儲存到知識庫');
      onSaved();
    } finally { setSaving(false); }
  };

  // 圖片上傳 → 解析
  const handleImgChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImgFile(file);
    setImgParsed('');
    setImgTitle(file.name.replace(/\.[^.]+$/, ''));
    const reader = new FileReader();
    reader.onload = ev => setImgPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleImgParse = async () => {
    if (!imgFile) return;
    setImgParsing(true);
    try {
      const fd = new FormData();
      fd.append('image', imgFile);
      const { data } = await axios.post('/api/knowledge/parse-image', fd);
      setImgParsed(data.content);
    } catch (err) {
      alert(`解析失敗：${err.response?.data?.error || err.message}`);
    } finally { setImgParsing(false); }
  };

  const handleImgSave = async () => {
    if (!imgTitle.trim() || !imgParsed.trim()) return alert('請先解析圖片');
    setSaving(true);
    try {
      await axios.post('/api/knowledge', {
        title: imgTitle, content: imgParsed,
        category: fileCategory, tags: [],
        source_type: 'image', source_file: imgFile?.name,
      });
      setImgFile(null); setImgPreview(''); setImgParsed(''); setImgTitle('');
      alert('✅ 已儲存到知識庫');
      onSaved();
    } finally { setSaving(false); }
  };

  // 檔案上傳 → 解析
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileParsing(true);
    setFileItems([]);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await axios.post('/api/knowledge/parse-file', fd);
      setFileType(data.type);
      if (data.type === 'pdf') {
        setPdfTitle(data.items[0].title);
        setPdfContent(data.items[0].content);
      } else {
        setFileItems(data.items);
        const checked = {};
        data.items.forEach((_, i) => { checked[i] = true; });
        setFileChecked(checked);
      }
    } catch (err) {
      alert(`解析失敗：${err.response?.data?.error || err.message}`);
    } finally { setFileParsing(false); }
  };

  const handleFileSave = async () => {
    setSaving(true);
    try {
      if (fileType === 'pdf') {
        await axios.post('/api/knowledge', {
          title: pdfTitle, content: pdfContent,
          category: fileCategory, tags: [], source_type: 'pdf',
        });
      } else {
        const selected = fileItems.filter((_, i) => fileChecked[i]);
        if (selected.length === 0) return alert('請至少選擇一筆');
        await axios.post('/api/knowledge/bulk', {
          items: selected, category: fileCategory,
          source_type: fileType,
        });
      }
      setFileItems([]); setFileChecked({}); setPdfTitle(''); setPdfContent('');
      alert(`✅ 已匯入${fileType === 'pdf' ? '' : ` ${Object.values(fileChecked).filter(Boolean).length} 筆`}到知識庫`);
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 760 }}>
      {/* 模式選擇 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
        {[
          ['manual', '✏️ 手動輸入'],
          ['image',  '🖼️ 上傳圖片'],
          ['file',   '📄 上傳 CSV / Excel / PDF'],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setMode(key)} style={{
            padding: '8px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
            border: mode === key ? '2px solid #3b82f6' : '1px solid #e2e8f0',
            background: mode === key ? '#eff6ff' : '#fff',
            color: mode === key ? '#3b82f6' : '#64748b',
          }}>{label}</button>
        ))}
      </div>

      {/* 手動輸入 */}
      {mode === 'manual' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>標題 *</label>
              <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="例：Tesla Model Y 規格" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>分類</label>
              <select value={form.category} onChange={e => set('category', e.target.value)} style={inputStyle}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyle}>標籤（逗號分隔，選填）</label>
            <input value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="例：電動車, SUV, 2024" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>內容 *</label>
            <textarea
              value={form.content} onChange={e => set('content', e.target.value)} rows={10}
              placeholder={'請輸入詳細內容，LINE Bot 會根據這些資料回答客戶問題\n\n例：\n顏色：星空黑、珍珠白、火焰紅\n售價：NT$2,189,000 起\n里程：584 公里（WLTP）'}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
          <button onClick={handleManualSave} disabled={saving} style={btnStyle('#3b82f6')}>
            {saving ? '儲存中...' : '✅ 儲存到知識庫'}
          </button>
        </div>
      )}

      {/* 上傳圖片 */}
      {mode === 'image' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            onClick={() => imgInputRef.current?.click()}
            style={{
              border: '2px dashed #cbd5e1', borderRadius: 12, padding: 40,
              textAlign: 'center', cursor: 'pointer', background: '#f8fafc',
              transition: 'border-color 0.2s',
            }}
          >
            {imgPreview ? (
              <img src={imgPreview} alt="preview" style={{ maxHeight: 200, maxWidth: '100%', borderRadius: 8 }} />
            ) : (
              <>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🖼️</div>
                <div style={{ fontSize: 14, color: '#64748b' }}>點擊或拖放圖片到這裡</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>支援 JPG、PNG、WebP</div>
              </>
            )}
          </div>
          <input ref={imgInputRef} type="file" accept="image/*" onChange={handleImgChange} style={{ display: 'none' }} />

          {imgFile && !imgParsed && (
            <button onClick={handleImgParse} disabled={imgParsing} style={btnStyle('#8b5cf6')}>
              {imgParsing ? '🤖 AI 解析中...' : '🤖 用 AI 解析圖片內容'}
            </button>
          )}

          {imgParsed && (
            <>
              <div>
                <label style={labelStyle}>標題</label>
                <input value={imgTitle} onChange={e => setImgTitle(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>分類</label>
                <select value={fileCategory} onChange={e => setFileCategory(e.target.value)} style={{ ...inputStyle, maxWidth: 200 }}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>AI 解析結果（可編輯）</label>
                <textarea
                  value={imgParsed} onChange={e => setImgParsed(e.target.value)}
                  rows={12} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
              <button onClick={handleImgSave} disabled={saving} style={btnStyle('#3b82f6')}>
                {saving ? '儲存中...' : '✅ 儲存到知識庫'}
              </button>
            </>
          )}
        </div>
      )}

      {/* 上傳檔案 */}
      {mode === 'file' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed #cbd5e1', borderRadius: 12, padding: 40,
              textAlign: 'center', cursor: 'pointer', background: '#f8fafc',
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
            <div style={{ fontSize: 14, color: '#64748b' }}>點擊上傳 CSV、Excel 或 PDF</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>.csv / .xlsx / .xls / .pdf，最大 20MB</div>
          </div>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.pdf" onChange={handleFileChange} style={{ display: 'none' }} />

          {fileParsing && <div style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>解析中...</div>}

          {/* PDF 結果 */}
          {fileType === 'pdf' && pdfContent && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>標題</label>
                  <input value={pdfTitle} onChange={e => setPdfTitle(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>分類</label>
                  <select value={fileCategory} onChange={e => setFileCategory(e.target.value)} style={inputStyle}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>提取的文字內容（可編輯）</label>
                <textarea value={pdfContent} onChange={e => setPdfContent(e.target.value)} rows={12} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              <button onClick={handleFileSave} disabled={saving} style={btnStyle('#3b82f6')}>
                {saving ? '儲存中...' : '✅ 儲存到知識庫'}
              </button>
            </>
          )}

          {/* CSV/Excel 結果 */}
          {(fileType === 'csv' || fileType === 'excel') && fileItems.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div>
                  <label style={labelStyle}>分類</label>
                  <select value={fileCategory} onChange={e => setFileCategory(e.target.value)} style={{ ...inputStyle, maxWidth: 180 }}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div style={{ alignSelf: 'flex-end', fontSize: 13, color: '#64748b' }}>
                  共 {fileItems.length} 筆，已選 {Object.values(fileChecked).filter(Boolean).length} 筆
                </div>
                <button
                  onClick={() => {
                    const allChecked = Object.values(fileChecked).every(Boolean);
                    const next = {};
                    fileItems.forEach((_, i) => { next[i] = !allChecked; });
                    setFileChecked(next);
                  }}
                  style={{ ...smallBtnStyle('#64748b'), alignSelf: 'flex-end' }}
                >
                  全選/取消
                </button>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', maxHeight: 400, overflowY: 'auto' }}>
                {fileItems.map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px',
                    borderBottom: '1px solid #f1f5f9', background: fileChecked[i] ? '#f0f9ff' : '#fff',
                  }}>
                    <input type="checkbox" checked={!!fileChecked[i]} onChange={e => setFileChecked(f => ({ ...f, [i]: e.target.checked }))} style={{ marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.content}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={handleFileSave} disabled={saving} style={btnStyle('#3b82f6')}>
                {saving ? '匯入中...' : `✅ 匯入選取的 ${Object.values(fileChecked).filter(Boolean).length} 筆`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 子元件 ──────────────────────────────────────────────────────────────────

function CategoryBadge({ cat }) {
  const c = catMap[cat] || catMap.general;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
      color: c.color, background: c.bg, border: `1px solid ${c.color}30`,
      flexShrink: 0,
    }}>{c.label}</span>
  );
}

// ─── 樣式 ─────────────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 8,
  border: '1px solid #e2e8f0', outline: 'none', boxSizing: 'border-box',
  background: '#fff', color: '#0f172a',
};

const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5,
};

function btnStyle(color) {
  return {
    padding: '10px 24px', fontSize: 13, fontWeight: 600, borderRadius: 8,
    border: 'none', cursor: 'pointer', background: color, color: '#fff',
  };
}

function smallBtnStyle(color) {
  return {
    padding: '4px 10px', fontSize: 12, fontWeight: 600, borderRadius: 6,
    border: `1px solid ${color}`, cursor: 'pointer', background: 'transparent', color,
  };
}
