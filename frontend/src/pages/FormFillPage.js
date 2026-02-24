import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Mic, MicOff, Send, ArrowLeft, Loader, X, Trash2, Upload } from 'lucide-react';
import { FIELD_VALIDATORS } from '../utils/fieldTypes';

export default function FormFillPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecording, setIsRecording] = useState(null);       // fieldId | null
  const [isTranscribing, setIsTranscribing] = useState(null); // fieldId | null
  const mediaRecorderRef = useRef(null);

  useEffect(() => {
    axios.get(`/api/forms/${id}`).then(res => {
      setForm(res.data);
      const defaults = {};
      res.data.schema?.fields?.forEach(f => {
        defaults[f.id] = f.type === 'checkbox' ? [] : '';
      });
      setValues(defaults);
    }).catch(() => toast.error('載入表單失敗'));
  }, [id]);

  const setValue = (fieldId, value) => {
    setValues(prev => ({ ...prev, [fieldId]: value }));
    if (errors[fieldId]) setErrors(prev => ({ ...prev, [fieldId]: null }));
  };

  /* 條件邏輯 */
  const isFieldVisible = (field) => {
    const cond = field.conditions;
    if (!cond?.enabled || !cond.rules?.length) return true;
    const results = cond.rules.map(rule => {
      const val = values[rule.fieldId];
      const target = rule.value;
      switch (rule.operator) {
        case 'eq':        return Array.isArray(val) ? val.includes(target) : String(val || '') === String(target);
        case 'neq':       return Array.isArray(val) ? !val.includes(target) : String(val || '') !== String(target);
        case 'contains':  return String(val || '').includes(target);
        case 'not_empty': return val !== '' && val !== null && val !== undefined && !(Array.isArray(val) && val.length === 0);
        default:          return true;
      }
    });
    return cond.logic === 'any' ? results.some(Boolean) : results.every(Boolean);
  };

  const validate = () => {
    const newErrors = {};
    const visibleFields = form.schema.fields.filter(f => isFieldVisible(f));
    visibleFields.forEach(field => {
      const val = values[field.id];
      if (field.required) {
        const isEmpty = !val || (Array.isArray(val) && val.length === 0) || val === '';
        if (isEmpty) newErrors[field.id] = `「${field.label}」為必填欄位`;
      }
      if (field.type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        newErrors[field.id] = '請輸入有效的 Email 格式';
      }
      if (field.type === 'phone' && val && !/^[0-9+\-\s()]{7,15}$/.test(val)) {
        newErrors[field.id] = '請輸入有效的電話號碼';
      }
      if (field.type === 'id_number' && val) {
        const result = FIELD_VALIDATORS.id_number(val);
        if (result !== true) newErrors[field.id] = result;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) { toast.error('請修正錯誤後再提交'); return; }
    setIsSubmitting(true);
    try {
      const visibleFields = form.schema.fields.filter(f => isFieldVisible(f));
      const submitData = {};
      visibleFields.forEach(f => { submitData[f.label] = values[f.id]; });
      await axios.post('/api/submissions', { form_id: id, data: submitData });
      toast.success('表單提交成功！');
      navigate('/');
    } catch {
      toast.error('提交失敗，請重試');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ── 語音錄音 → STT API ── */
  const startRecording = async (fieldId) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setIsRecording(null);
        setIsTranscribing(fieldId);
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          const formData = new FormData();
          formData.append('audio', blob, 'recording.webm');
          formData.append('language', 'zh-TW');

          const res = await axios.post('/api/voice/recognize', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });

          if (res.data.setup_required) {
            toast('語音辨識尚未設定，請聯絡管理員配置 STT API Key', { icon: '⚙️' });
          } else if (res.data.transcript) {
            setValue(fieldId, res.data.transcript);
            toast.success(`辨識完成（信心度 ${Math.round((res.data.confidence || 0) * 100)}%）`);
          } else {
            toast.error('未辨識到語音內容，請重試');
          }
        } catch {
          toast.error('語音辨識失敗，請重試');
        } finally {
          setIsTranscribing(null);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(fieldId);
    } catch {
      toast.error('無法存取麥克風，請確認權限設定');
    }
  };

  const stopRecording = () => { mediaRecorderRef.current?.stop(); };

  if (!form) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
      <Loader size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const fields = form.schema?.fields || [];

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: 32 }}>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')} style={{ marginBottom: 20 }}>
        <ArrowLeft size={16} /> 返回
      </button>
      <div className="card" style={{ padding: 28, marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>{form.title}</h1>
        {form.description && (
          <p style={{ color: 'var(--text-2)', fontSize: 14, marginTop: 6 }}>{form.description}</p>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ padding: 28 }}>
          {fields.map(field => {
            if (!isFieldVisible(field)) return null;
            return (
              <div key={field.id} style={{ marginBottom: 24 }}>
                <label className="label" style={{ fontSize: 14, marginBottom: 6 }}>
                  {field.label}
                  {field.required && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>}
                </label>
                <FieldInput
                  field={field}
                  value={values[field.id]}
                  onChange={v => setValue(field.id, v)}
                  isRecording={isRecording === field.id}
                  isTranscribing={isTranscribing === field.id}
                  onStartRecording={() => startRecording(field.id)}
                  onStopRecording={stopRecording}
                  hasError={!!errors[field.id]}
                />
                {field.helpText && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{field.helpText}</div>
                )}
                {errors[field.id] && (
                  <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>⚠ {errors[field.id]}</div>
                )}
              </div>
            );
          })}

          <button type="submit" className="btn btn-primary btn-lg"
            disabled={isSubmitting}
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
            {isSubmitting
              ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> 提交中...</>
              : <><Send size={16} /> 提交表單</>}
          </button>
        </div>
      </form>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── 簽名欄位（Canvas） ─────────────────────────────────────────── */
function SignatureField({ value, onChange }) {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const lastPos = useRef(null);

  useEffect(() => {
    if (value && canvasRef.current) {
      const img = new Image();
      img.onload = () => {
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = value;
    }
  }, []);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if (e.touches) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDraw = (e) => { e.preventDefault(); isDrawing.current = true; lastPos.current = getPos(e, canvasRef.current); };
  const draw = (e) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
  };
  const endDraw = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    onChange(canvasRef.current.toDataURL('image/png'));
  };
  const clearSignature = () => {
    canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    onChange('');
  };

  return (
    <div>
      <div style={{ position: 'relative', border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
        <canvas ref={canvasRef} width={560} height={160}
          style={{ display: 'block', width: '100%', height: 160, cursor: 'crosshair', touchAction: 'none' }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
        {!value && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', color: 'var(--text-3)', fontSize: 13 }}>
            在此處簽名
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={clearSignature} style={{ color: 'var(--danger)' }}>
          <Trash2 size={13} /> 清除簽名
        </button>
      </div>
    </div>
  );
}

/* ── 圖片上傳欄位 ───────────────────────────────────────────────── */
function ImageUploadField({ value, onChange }) {
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('請選擇圖片檔案'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('圖片大小不可超過 5MB'); return; }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await axios.post('/api/uploads/image', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      onChange(res.data.url);
      toast.success('圖片上傳成功');
    } catch { toast.error('圖片上傳失敗'); }
    finally { setIsUploading(false); }
  };

  return (
    <div>
      {value ? (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img src={value.startsWith('/uploads/') ? `http://localhost:3001${value}` : value}
            alt="已上傳"
            style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, border: '1px solid var(--border)', display: 'block' }} />
          <button type="button" onClick={() => onChange('')}
            style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none',
              borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} color="#fff" />
          </button>
        </div>
      ) : (
        <div onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
          style={{ border: '2px dashed var(--border)', borderRadius: 8, padding: '32px 20px',
            textAlign: 'center', cursor: 'pointer', background: 'var(--surface-2)', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary-light)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface-2)'; }}>
          {isUploading ? (
            <div style={{ color: 'var(--primary)' }}>
              <Loader size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
              <div style={{ fontSize: 13 }}>上傳中...</div>
            </div>
          ) : (
            <>
              <Upload size={28} color="var(--text-3)" style={{ marginBottom: 8 }} />
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>點擊或拖曳圖片至此處</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>支援 JPEG、PNG、GIF、WebP，最大 5MB</div>
            </>
          )}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => handleFile(e.target.files[0])} />
    </div>
  );
}

/* ── 各欄位渲染 ─────────────────────────────────────────────────── */
function FieldInput({ field, value, onChange, isRecording, isTranscribing, onStartRecording, onStopRecording, hasError }) {
  const borderColor = hasError ? 'var(--danger)' : undefined;

  switch (field.type) {
    case 'signature':
      return <SignatureField value={value} onChange={onChange} />;

    case 'image':
      return <ImageUploadField value={value} onChange={onChange} />;

    case 'textarea':
      return <textarea className="input" value={value || ''} onChange={e => onChange(e.target.value)}
        placeholder={field.placeholder} rows={4} style={{ resize: 'vertical', borderColor }} />;

    case 'select':
      return (
        <select className="input" value={value || ''} onChange={e => onChange(e.target.value)} style={{ borderColor }}>
          <option value="">請選擇...</option>
          {field.options?.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
        </select>
      );

    case 'radio':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {field.options?.map((opt, i) => (
            <label key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14,
              padding: '6px 10px', borderRadius: 8,
              background: value === opt ? 'var(--primary-light)' : 'transparent',
              border: `1.5px solid ${value === opt ? 'var(--primary)' : 'var(--border)'}`,
              transition: 'all 0.15s',
            }}>
              <input type="radio" name={field.id} value={opt} checked={value === opt} onChange={() => onChange(opt)} />
              {opt}
            </label>
          ))}
        </div>
      );

    case 'checkbox':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {field.options?.map((opt, i) => {
            const checked = (value || []).includes(opt);
            return (
              <label key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14,
                padding: '6px 10px', borderRadius: 8,
                background: checked ? 'var(--primary-light)' : 'transparent',
                border: `1.5px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
                transition: 'all 0.15s',
              }}>
                <input type="checkbox" checked={checked} onChange={() => {
                  const next = checked ? (value || []).filter(v => v !== opt) : [...(value || []), opt];
                  onChange(next);
                }} />
                {opt}
              </label>
            );
          })}
        </div>
      );

    case 'date':
      return <input type="date" className="input" value={value || ''} onChange={e => onChange(e.target.value)} style={{ borderColor }} />;

    case 'number':
      return <input type="number" className="input" value={value || ''} onChange={e => onChange(e.target.value)}
        placeholder={field.placeholder || '請輸入數字'}
        min={field.validation?.min} max={field.validation?.max} style={{ borderColor }} />;

    case 'email':
      return <input type="email" className="input" value={value || ''} onChange={e => onChange(e.target.value)}
        placeholder={field.placeholder || 'example@email.com'} style={{ borderColor }} />;

    case 'phone':
      return <input type="tel" className="input" value={value || ''} onChange={e => onChange(e.target.value)}
        placeholder={field.placeholder || '0912-345-678'} style={{ borderColor }} />;

    case 'voice':
      return (
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: 12,
            border: `1.5px solid ${isRecording ? 'var(--danger)' : isTranscribing ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 8,
            background: isRecording ? '#fff5f5' : isTranscribing ? 'var(--primary-light)' : 'var(--surface-2)',
            transition: 'all 0.2s',
          }}>
            <button type="button"
              onClick={isRecording ? onStopRecording : onStartRecording}
              disabled={!!isTranscribing}
              style={{
                width: 44, height: 44,
                background: isRecording ? 'var(--danger)' : 'var(--primary)',
                borderRadius: '50%', border: 'none',
                cursor: isTranscribing ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                opacity: isTranscribing ? 0.7 : 1,
              }}>
              {isTranscribing
                ? <Loader size={20} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                : isRecording ? <MicOff size={20} color="#fff" /> : <Mic size={20} color="#fff" />}
            </button>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600,
                color: isRecording ? 'var(--danger)' : isTranscribing ? 'var(--primary)' : 'var(--text)' }}>
                {isTranscribing ? 'AI 辨識中...'
                  : isRecording ? '錄音中... 點擊停止'
                  : '點擊開始語音輸入'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {isTranscribing ? '正在將語音轉換為文字，請稍候' : '語音辨識後自動填入欄位'}
              </div>
            </div>
          </div>
          {value && (
            <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--surface-3)', borderRadius: 6, fontSize: 14 }}>
              {value}
            </div>
          )}
        </div>
      );

    case 'id_number':
      return <input type="text" className="input" value={value || ''}
        onChange={e => onChange(e.target.value.toUpperCase())}
        placeholder={field.placeholder || 'A123456789'}
        maxLength={10}
        style={{ borderColor, fontFamily: 'monospace', letterSpacing: '0.1em' }} />;

    default:
      return <input type="text" className="input" value={value || ''} onChange={e => onChange(e.target.value)}
        placeholder={field.placeholder || ''} maxLength={field.validation?.maxLength} style={{ borderColor }} />;
  }
}
