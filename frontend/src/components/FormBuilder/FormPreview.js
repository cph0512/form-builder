import React from 'react';
import { Mic, Image } from 'lucide-react';

export default function FormPreview({ title, description, fields }) {
  return (
    <div>
      <div className="card" style={{ padding: 28, marginBottom: 16 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>{title}</h2>
        {description && <p style={{ color: 'var(--text-2)', fontSize: 14 }}>{description}</p>}
      </div>
      <div className="card" style={{ padding: 28 }}>
        {fields.length === 0 ? (
          <p style={{ color: 'var(--text-3)', textAlign: 'center', padding: 32 }}>尚未新增任何欄位</p>
        ) : (
          fields.map(field => (
            <div key={field.id} style={{ marginBottom: 24 }}>
              <label className="label" style={{ fontSize: 14 }}>
                {field.label}
                {field.required && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>}
              </label>
              <FieldPreview field={field} />
              {field.helpText && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{field.helpText}</div>}
            </div>
          ))
        )}
        {fields.length > 0 && (
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
            提交表單
          </button>
        )}
      </div>
    </div>
  );
}

function FieldPreview({ field }) {
  switch (field.type) {
    case 'textarea':
      return <textarea className="input" placeholder={field.placeholder || ''} rows={3} style={{ resize: 'vertical' }} readOnly />;
    case 'select':
      return (
        <select className="input">
          <option value="">請選擇...</option>
          {field.options?.map((opt, i) => <option key={i}>{opt}</option>)}
        </select>
      );
    case 'radio':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {field.options?.map((opt, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="radio" name={field.id} readOnly /> {opt}
            </label>
          ))}
        </div>
      );
    case 'checkbox':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {field.options?.map((opt, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" readOnly /> {opt}
            </label>
          ))}
        </div>
      );
    case 'date':
      return <input type="date" className="input" readOnly />;
    case 'number':
      return <input type="number" className="input" placeholder={field.placeholder || '請輸入數字'} readOnly />;
    case 'email':
      return <input type="email" className="input" placeholder={field.placeholder || 'example@email.com'} readOnly />;
    case 'phone':
      return <input type="tel" className="input" placeholder={field.placeholder || '0912-345-678'} readOnly />;
    case 'voice':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--surface-2)', borderRadius: 8, border: '1.5px solid var(--border)' }}>
          <div style={{ width: 40, height: 40, background: 'var(--primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Mic size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>點擊錄音</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>語音辨識後自動填入</div>
          </div>
        </div>
      );
    case 'image':
      return (
        <div style={{ border: '2px dashed var(--border)', borderRadius: 8, padding: 32, textAlign: 'center', cursor: 'pointer' }}>
          <Image size={24} color="var(--text-3)" style={{ marginBottom: 6 }} />
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>點擊上傳圖片或拍照</div>
        </div>
      );
    case 'signature':
      return (
        <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, height: 100, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>手寫簽名區域</span>
        </div>
      );
    case 'address':
      return <input type="text" className="input" placeholder="請輸入完整地址" readOnly />;
    case 'id_number':
      return <input type="text" className="input" placeholder="A123456789" maxLength={10}
        style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }} readOnly />;
    default:
      return <input type="text" className="input" placeholder={field.placeholder || ''} readOnly />;
  }
}
