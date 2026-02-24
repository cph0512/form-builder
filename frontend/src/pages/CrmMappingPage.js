import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, Trash2, Save, Loader, Wand2, Info } from 'lucide-react';
import { useSelectorInspector, InspectorBtn, SelectorInspectorModal } from '../components/SelectorInspector';
import { useAuthStore } from '../store';

export default function CrmMappingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const connIdFromUrl = searchParams.get('conn') || '';
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'super_admin';

  const [forms, setForms] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedFormId, setSelectedFormId] = useState('');
  const [selectedConnId, setSelectedConnId] = useState(connIdFromUrl);
  const [currentForm, setCurrentForm] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingMapping, setIsLoadingMapping] = useState(false);

  /* ── 初始載入表單清單 + 連線清單 ── */
  useEffect(() => {
    Promise.all([
      axios.get('/api/forms'),
      axios.get('/api/crm/connections'),
    ]).then(([formsRes, connRes]) => {
      setForms(formsRes.data.filter(f => f.is_active));
      setConnections(connRes.data.filter(c => c.is_active));
    }).catch(() => toast.error('載入資料失敗'));
  }, []);

  /* ── 選擇表單後載入完整欄位 ── */
  useEffect(() => {
    if (!selectedFormId) { setCurrentForm(null); return; }
    axios.get(`/api/forms/${selectedFormId}`)
      .then(res => setCurrentForm(res.data))
      .catch(() => toast.error('載入表單欄位失敗'));
  }, [selectedFormId]);

  /* ── 選擇表單 + 連線後載入已儲存的對應 ── */
  const loadMapping = useCallback(async () => {
    if (!selectedFormId || !selectedConnId) return;
    setIsLoadingMapping(true);
    try {
      const res = await axios.get(`/api/crm/mappings?form_id=${selectedFormId}`);
      const existing = res.data.find(m => m.crm_connection_id === selectedConnId);
      setMappings(existing?.mappings || []);
    } catch {
      setMappings([]);
    } finally {
      setIsLoadingMapping(false);
    }
  }, [selectedFormId, selectedConnId]);

  useEffect(() => { loadMapping(); }, [loadMapping]);

  /* ── 操作 ── */
  const addRow = () =>
    setMappings(m => [...m, { formFieldLabel: '', crmSelector: '', crmFieldName: '', fieldType: 'text', note: '' }]);

  const updateRow = (idx, key, value) =>
    setMappings(m => m.map((row, i) => i === idx ? { ...row, [key]: value } : row));

  const removeRow = (idx) =>
    setMappings(m => m.filter((_, i) => i !== idx));

  const autoFill = () => {
    const fields = currentForm?.schema?.fields || [];
    if (!fields.length) { toast.error('此表單沒有欄位'); return; }
    setMappings(fields.map(f => ({
      formFieldLabel: f.label,
      crmSelector: '',
      crmFieldName: f.label,
      fieldType: f.type,
      note: '',
    })));
    toast.success(`已自動帶入 ${fields.length} 個欄位，請填寫右側 CRM 對應值`);
  };

  const handleSave = async () => {
    if (!selectedFormId || !selectedConnId) {
      toast.error('請選擇表單與 CRM 連線');
      return;
    }
    setIsSaving(true);
    try {
      await axios.put('/api/crm/mappings', {
        form_id: selectedFormId,
        crm_connection_id: selectedConnId,
        mappings,
        is_active: true,
      });
      toast.success('欄位對應已儲存');
    } catch {
      toast.error('儲存失敗');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedConn = connections.find(c => c.id === selectedConnId);
  const isRpa = selectedConn?.type === 'rpa_web';
  const formFields = currentForm?.schema?.fields || [];
  const ready = !!selectedFormId && !!selectedConnId;

  // Selector 測試工具（僅 RPA 模式使用）
  const inspector = useSelectorInspector();
  // RPA 資料輸入頁 URL（用於截圖測試欄位 Selector）
  const rpaInspectorUrl = selectedConn?.config?.dataEntryUrl?.trim() || selectedConn?.url || '';

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      {/* Back */}
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/crm/connections')}
        style={{ marginBottom: 20 }}>
        <ArrowLeft size={16} /> 返回連線管理
      </button>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>欄位對應設定</h1>
          <p style={{ color: 'var(--text-2)', fontSize: 14 }}>
            指定表單欄位對應到 CRM 系統中的哪個欄位
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {isSuperAdmin && ready && formFields.length > 0 && (
            <button className="btn btn-ghost" onClick={autoFill}>
              <Wand2 size={15} /> 從表單自動填入
            </button>
          )}
          {isSuperAdmin && (
            <button className="btn btn-primary" onClick={handleSave} disabled={isSaving || !ready}>
              {isSaving
                ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> 儲存中...</>
                : <><Save size={15} /> 儲存對應</>}
            </button>
          )}
        </div>
      </div>

      {/* Selectors */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <label className="label">選擇表單</label>
            <select className="input" value={selectedFormId}
              onChange={e => setSelectedFormId(e.target.value)}>
              <option value="">請選擇表單...</option>
              {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
          </div>
          <div>
            <label className="label">選擇 CRM 連線</label>
            <select className="input" value={selectedConnId}
              onChange={e => setSelectedConnId(e.target.value)}>
              <option value="">請選擇 CRM 連線...</option>
              {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {/* Mode hint */}
        {selectedConn && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8, fontSize: 13 }}>
            <Info size={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--primary)' }} />
            <div>
              <strong>
                {isRpa ? 'RPA 模式' : selectedConn.type === 'salesforce_api' ? 'Salesforce API 模式' : '通用 API 模式'}
              </strong>
              {' — '}
              {isRpa
                ? <>右欄填入 CSS Selector（例：<code>input[name="email"]</code>），點擊 🔍 可截圖確認元素是否正確命中。不知道 Selector 怎麼取得？請見 <strong>CSS Selector 測試工具</strong> 的說明。</>
                : selectedConn.type === 'salesforce_api'
                  ? '右欄請填入 Salesforce 欄位 API 名稱（例：Email、LastName、Phone），自訂欄位通常以 __c 結尾。'
                  : '右欄請填入 JSON 鍵名（例：email、phone），系統會以此為 key 組成 JSON 傳送至 API。'}
            </div>
          </div>
        )}
      </div>

      {/* Mapping table */}
      {!ready ? (
        <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>
          請先選擇表單和 CRM 連線，再設定欄位對應關係
        </div>
      ) : isLoadingMapping ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Loader size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
        </div>
      ) : (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontWeight: 600 }}>
              欄位對應表
              <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-2)', marginLeft: 8 }}>
                共 {mappings.length} 個對應
              </span>
            </span>
            {isSuperAdmin && (
              <button className="btn btn-ghost btn-sm" onClick={addRow}>
                <Plus size={14} /> 新增一行
              </button>
            )}
          </div>

          {mappings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 16 }}>
                尚未設定任何欄位對應
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                {formFields.length > 0 && (
                  <button className="btn btn-ghost" onClick={autoFill}>
                    <Wand2 size={14} /> 從表單自動填入
                  </button>
                )}
                <button className="btn btn-primary" onClick={addRow}>
                  <Plus size={14} /> 手動新增
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isRpa ? '1fr 1fr 40px 140px 36px' : '1fr 1fr 160px 36px',
                gap: 10,
                padding: '8px 10px',
                background: 'var(--surface-2)',
                borderRadius: 8,
                marginBottom: 8,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-2)',
              }}>
                <div>表單欄位</div>
                <div>{isRpa ? 'CSS Selector' : 'CRM 欄位名稱'}</div>
                {isRpa && <div title="截圖測試 Selector">🔍</div>}
                <div>備註（可選）</div>
                <div></div>
              </div>

              {/* Rows */}
              {mappings.map((row, idx) => (
                <div key={idx} style={{
                  display: 'grid',
                  gridTemplateColumns: isRpa ? '1fr 1fr 40px 140px 36px' : '1fr 1fr 160px 36px',
                  gap: 10,
                  marginBottom: 8,
                  alignItems: 'center',
                }}>
                  {/* Form field selector */}
                  <select className="input" value={row.formFieldLabel}
                    onChange={e => {
                      const field = formFields.find(f => f.label === e.target.value);
                      updateRow(idx, 'formFieldLabel', e.target.value);
                      if (field) updateRow(idx, 'fieldType', field.type);
                    }}>
                    <option value="">選擇欄位...</option>
                    {formFields.map(f => <option key={f.id} value={f.label}>{f.label}</option>)}
                  </select>

                  {/* CRM field */}
                  <input className="input"
                    placeholder={isRpa ? 'input[name="fieldName"]' : 'FieldAPIName__c'}
                    value={isRpa ? (row.crmSelector || '') : (row.crmFieldName || '')}
                    onChange={e => updateRow(idx, isRpa ? 'crmSelector' : 'crmFieldName', e.target.value)} />

                  {/* Inspector button（RPA 模式才顯示） */}
                  {isRpa && (
                    <InspectorBtn
                      disabled={!rpaInspectorUrl || !row.crmSelector}
                      title={
                        !rpaInspectorUrl ? '請先在連線設定中填寫 CRM 網址'
                        : !row.crmSelector ? '請先填寫 CSS Selector'
                        : '截圖測試此 Selector'
                      }
                      onClick={() => inspector.open(rpaInspectorUrl, row.crmSelector)}
                    />
                  )}

                  {/* Note */}
                  <input className="input" placeholder="備註"
                    value={row.note || ''}
                    onChange={e => updateRow(idx, 'note', e.target.value)} />

                  {/* Delete */}
                  {isSuperAdmin ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => removeRow(idx)}
                      style={{ color: 'var(--danger)', padding: '6px 8px' }}>
                      <Trash2 size={14} />
                    </button>
                  ) : <div />}
                </div>
              ))}

              {isSuperAdmin && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                  <button className="btn btn-ghost btn-sm" onClick={addRow}>
                    <Plus size={14} /> 新增一行
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Selector 測試工具 Modal */}
      <SelectorInspectorModal inspector={inspector} />
    </div>
  );
}
