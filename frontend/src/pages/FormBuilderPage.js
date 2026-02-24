import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import axios from 'axios';
import { useFormStore } from '../store';
import { FIELD_TYPES, createField } from '../utils/fieldTypes';
import SortableField from '../components/FormBuilder/SortableField';
import FieldEditor from '../components/FormBuilder/FieldEditor';
import FormPreview from '../components/FormBuilder/FormPreview';
import { Save, Eye, ArrowLeft, Plus, History, X, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';

export default function FormBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { fetchForm, saveForm } = useFormStore();

  const [title, setTitle] = useState('未命名表單');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState([]);
  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const [activeTab, setActiveTab] = useState('build');
  const [isSaving, setIsSaving] = useState(false);
  const [formId, setFormId] = useState(id === 'new' ? null : id);

  // 版本歷史
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const selectedField = fields.find(f => f.id === selectedFieldId);

  useEffect(() => {
    if (id && id !== 'new') {
      fetchForm(id).then(form => {
        setTitle(form.title);
        setDescription(form.description || '');
        setFields(form.schema?.fields || []);
        setFormId(form.id);
      });
    }
  }, [id]);

  const addField = (type) => {
    const newField = createField(type);
    setFields(prev => [...prev, newField]);
    setSelectedFieldId(newField.id);
  };

  const updateField = (fieldId, updates) => {
    setFields(prev => prev.map(f => f.id === fieldId ? { ...f, ...updates } : f));
  };

  const deleteField = (fieldId) => {
    setFields(prev => prev.filter(f => f.id !== fieldId));
    if (selectedFieldId === fieldId) setSelectedFieldId(null);
  };

  const handleDragEnd = ({ active, over }) => {
    if (active.id !== over?.id) {
      const oldIndex = fields.findIndex(f => f.id === active.id);
      const newIndex = fields.findIndex(f => f.id === over.id);
      setFields(arrayMove(fields, oldIndex, newIndex));
    }
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error('請輸入表單名稱'); return; }
    if (fields.length === 0) { toast.error('請至少新增一個欄位'); return; }
    setIsSaving(true);
    try {
      const result = await saveForm({ id: formId, title, description, schema: { fields } });
      setFormId(result.id);
      toast.success('表單已儲存');
      if (!formId) navigate(`/builder/${result.id}`, { replace: true });
    } catch {
      toast.error('儲存失敗，請重試');
    } finally {
      setIsSaving(false);
    }
  };

  // 版本歷史相關
  const openVersions = async () => {
    if (!formId) { toast('請先儲存表單再查看版本歷史'); return; }
    setShowVersions(true);
    setIsLoadingVersions(true);
    try {
      const res = await axios.get(`/api/forms/${formId}/versions`);
      setVersions(res.data);
    } catch {
      toast.error('載入版本歷史失敗');
    } finally {
      setIsLoadingVersions(false);
    }
  };

  const restoreVersion = (ver) => {
    if (!window.confirm(`確定要還原到版本 v${ver.version_number}？目前未儲存的變更將會遺失。`)) return;
    const schema = typeof ver.schema === 'string' ? JSON.parse(ver.schema) : ver.schema;
    setFields(schema?.fields || []);
    setSelectedFieldId(null);
    setShowVersions(false);
    setPreviewVersion(null);
    toast.success(`已還原到 v${ver.version_number}`);
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}><ArrowLeft size={16} /> 返回</button>
        <div style={{ flex: 1 }}>
          <input value={title} onChange={e => setTitle(e.target.value)}
            style={{ border: 'none', outline: 'none', fontSize: 18, fontWeight: 700, fontFamily: 'inherit', color: 'var(--text)', background: 'transparent', width: '100%' }}
            placeholder="表單名稱" />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {formId && (
            <button className="btn btn-secondary btn-sm" onClick={openVersions} title="版本歷史">
              <History size={14} /> 版本歷史
            </button>
          )}
          <button className={`btn btn-sm ${activeTab === 'build' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('build')}>
            <Plus size={14} /> 設計
          </button>
          <button className={`btn btn-sm ${activeTab === 'preview' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('preview')}>
            <Eye size={14} /> 預覽
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={isSaving}>
            <Save size={14} /> {isSaving ? '儲存中...' : '儲存'}
          </button>
        </div>
      </div>

      {activeTab === 'preview' ? (
        <div style={{ flex: 1, overflow: 'auto', padding: 32, display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 640 }}>
            <FormPreview title={title} description={description} fields={fields} />
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr 280px', overflow: 'hidden' }}>
          {/* Left Panel: Field Types */}
          <div style={{ background: '#fff', borderRight: '1px solid var(--border)', overflow: 'auto', padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>點擊新增欄位</div>
            {FIELD_TYPES.map(({ type, label, icon: Icon, description: desc }) => (
              <button key={type} onClick={() => addField(type)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 10px', marginBottom: 4, background: 'transparent',
                border: '1px solid transparent', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary-light)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
              >
                <Icon size={16} color="var(--primary)" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{label}</span>
              </button>
            ))}
          </div>

          {/* Center: Canvas */}
          <div style={{ overflow: 'auto', padding: 24, background: 'var(--surface-2)' }}>
            <div style={{ maxWidth: 640, margin: '0 auto' }}>
              <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="表單說明（選填）"
                  style={{ border: 'none', outline: 'none', resize: 'none', width: '100%', fontFamily: 'inherit', fontSize: 14, color: 'var(--text-2)', background: 'transparent', minHeight: 48 }}
                />
              </div>

              {fields.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-3)', border: '2px dashed var(--border)', borderRadius: 12 }}>
                  <Plus size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
                  <p style={{ fontSize: 14 }}>點擊左側欄位類型即可新增欄位</p>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                    {fields.map(field => (
                      <SortableField
                        key={field.id}
                        field={field}
                        isSelected={selectedFieldId === field.id}
                        onSelect={() => setSelectedFieldId(field.id)}
                        onDelete={() => deleteField(field.id)}
                        onDuplicate={() => {
                          const dup = { ...field, id: `field_${Date.now()}` };
                          const idx = fields.findIndex(f => f.id === field.id);
                          const next = [...fields];
                          next.splice(idx + 1, 0, dup);
                          setFields(next);
                        }}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>

          {/* Right Panel: Field Editor */}
          <div style={{ background: '#fff', borderLeft: '1px solid var(--border)', overflow: 'auto' }}>
            {selectedField ? (
              <FieldEditor
                field={selectedField}
                allFields={fields}
                onUpdate={(updates) => updateField(selectedField.id, updates)}
              />
            ) : (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', paddingTop: 60 }}>
                <p style={{ fontSize: 13 }}>選擇一個欄位<br />來編輯其屬性</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Version History Modal */}
      {showVersions && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }} onClick={e => { if (e.target === e.currentTarget) { setShowVersions(false); setPreviewVersion(null); } }}>
          <div className="card" style={{ width: '100%', maxWidth: 720, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <History size={18} color="var(--primary)" />
                <span style={{ fontWeight: 700, fontSize: 16 }}>版本歷史</span>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>共 {versions.length} 個版本</span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowVersions(false); setPreviewVersion(null); }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Version List */}
              <div style={{ width: 260, borderRight: '1px solid var(--border)', overflow: 'auto', flexShrink: 0 }}>
                {isLoadingVersions ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>載入中...</div>
                ) : versions.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>尚無版本記錄</div>
                ) : versions.map((ver, i) => (
                  <div
                    key={ver.id}
                    onClick={() => setPreviewVersion(ver)}
                    style={{
                      padding: '14px 20px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                      background: previewVersion?.id === ver.id ? 'var(--primary-light)' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (previewVersion?.id !== ver.id) e.currentTarget.style.background = 'var(--surface-2)'; }}
                    onMouseLeave={e => { if (previewVersion?.id !== ver.id) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: previewVersion?.id === ver.id ? 'var(--primary)' : 'var(--text)' }}>
                        v{ver.version_number}
                      </span>
                      {i === 0 && <span style={{ fontSize: 10, background: '#10b981', color: '#fff', padding: '1px 6px', borderRadius: 4 }}>最新</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{ver.creator_name || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                      {new Date(ver.created_at).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Version Preview */}
              <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
                {!previewVersion ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-3)', fontSize: 13 }}>
                    選擇版本查看欄位內容
                  </div>
                ) : (() => {
                  const schema = typeof previewVersion.schema === 'string' ? JSON.parse(previewVersion.schema) : previewVersion.schema;
                  const vFields = schema?.fields || [];
                  return (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>v{previewVersion.version_number} · {vFields.length} 個欄位</div>
                        <button className="btn btn-primary btn-sm" onClick={() => restoreVersion(previewVersion)}>
                          <RotateCcw size={14} /> 還原此版本
                        </button>
                      </div>
                      {vFields.map(f => (
                        <div key={f.id} style={{ padding: '10px 14px', marginBottom: 8, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{f.label}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                            {f.type} {f.required ? '· 必填' : ''} {f.options?.length ? `· ${f.options.join(', ')}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
