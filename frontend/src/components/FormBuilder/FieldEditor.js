import React, { useState } from 'react';
import { Trash2, Plus, ChevronDown, ChevronUp } from 'lucide-react';

const OPERATORS = [
  { value: 'eq', label: '等於' },
  { value: 'neq', label: '不等於' },
  { value: 'contains', label: '包含' },
  { value: 'not_empty', label: '不為空' },
];

export default function FieldEditor({ field, allFields = [], onUpdate }) {
  const [showConditions, setShowConditions] = useState(false);

  const updateOption = (idx, value) => {
    const next = [...field.options];
    next[idx] = value;
    onUpdate({ options: next });
  };

  const addOption = () => onUpdate({ options: [...(field.options || []), `選項 ${(field.options?.length || 0) + 1}`] });
  const removeOption = (idx) => onUpdate({ options: field.options.filter((_, i) => i !== idx) });

  // 條件邏輯
  const cond = field.conditions || { enabled: false, logic: 'all', rules: [] };

  const updateCond = (updates) => {
    onUpdate({ conditions: { ...cond, ...updates } });
  };

  const addRule = () => {
    const firstOtherField = allFields.find(f => f.id !== field.id);
    updateCond({
      rules: [...cond.rules, { fieldId: firstOtherField?.id || '', operator: 'eq', value: '' }],
    });
  };

  const updateRule = (idx, updates) => {
    const next = [...cond.rules];
    next[idx] = { ...next[idx], ...updates };
    updateCond({ rules: next });
  };

  const removeRule = (idx) => {
    updateCond({ rules: cond.rules.filter((_, i) => i !== idx) });
  };

  // 其他欄位（可作為條件來源）
  const otherFields = allFields.filter(f => f.id !== field.id);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>欄位設定</div>

      {/* Label */}
      <FormGroup label="欄位名稱 *">
        <input className="input" value={field.label} onChange={e => onUpdate({ label: e.target.value })} placeholder="欄位名稱" />
      </FormGroup>

      {/* Placeholder */}
      {!['select', 'radio', 'checkbox', 'voice', 'image', 'signature'].includes(field.type) && (
        <FormGroup label="提示文字">
          <input className="input" value={field.placeholder || ''} onChange={e => onUpdate({ placeholder: e.target.value })} placeholder="輸入提示文字..." />
        </FormGroup>
      )}

      {/* Help text */}
      <FormGroup label="說明文字">
        <input className="input" value={field.helpText || ''} onChange={e => onUpdate({ helpText: e.target.value })} placeholder="顯示在欄位下方的說明..." />
      </FormGroup>

      {/* Required toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>必填欄位</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>使用者必須填寫此欄位</div>
        </div>
        <Toggle value={field.required} onChange={v => onUpdate({ required: v })} />
      </div>

      {/* Options */}
      {['select', 'radio', 'checkbox'].includes(field.type) && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>選項設定</div>
          {(field.options || []).map((opt, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
              <input className="input" value={opt} onChange={e => updateOption(idx, e.target.value)}
                style={{ flex: 1 }} placeholder={`選項 ${idx + 1}`} />
              <button className="btn btn-ghost btn-sm" onClick={() => removeOption(idx)}
                style={{ padding: '6px', color: 'var(--danger)', flexShrink: 0 }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button className="btn btn-secondary btn-sm" onClick={addOption} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
            <Plus size={14} /> 新增選項
          </button>
        </div>
      )}

      {/* Number validation */}
      {field.type === 'number' && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>數值範圍</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <FormGroup label="最小值">
              <input className="input" type="number" value={field.validation?.min || ''} onChange={e => onUpdate({ validation: { ...field.validation, min: e.target.value } })} placeholder="無限制" />
            </FormGroup>
            <FormGroup label="最大值">
              <input className="input" type="number" value={field.validation?.max || ''} onChange={e => onUpdate({ validation: { ...field.validation, max: e.target.value } })} placeholder="無限制" />
            </FormGroup>
          </div>
        </div>
      )}

      {/* Text max length */}
      {['text', 'textarea'].includes(field.type) && (
        <div style={{ marginBottom: 16 }}>
          <FormGroup label="字數上限">
            <input className="input" type="number" value={field.validation?.maxLength || ''} onChange={e => onUpdate({ validation: { ...field.validation, maxLength: e.target.value } })} placeholder="不限制" />
          </FormGroup>
        </div>
      )}

      {/* Conditional Logic Section */}
      {otherFields.length > 0 && (
        <div>
          <button
            onClick={() => setShowConditions(!showConditions)}
            style={{
              width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0', background: 'transparent', border: 'none', borderTop: '1px solid var(--border)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>條件顯示</div>
              {cond.enabled && (
                <span style={{ fontSize: 10, background: 'var(--primary)', color: '#fff', padding: '1px 6px', borderRadius: 4 }}>已啟用</span>
              )}
            </div>
            {showConditions ? <ChevronUp size={14} color="var(--text-3)" /> : <ChevronDown size={14} color="var(--text-3)" />}
          </button>

          {showConditions && (
            <div style={{ paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>依條件顯示或隱藏此欄位</div>
                <Toggle value={cond.enabled} onChange={v => updateCond({ enabled: v })} />
              </div>

              {cond.enabled && (
                <>
                  {/* Logic mode */}
                  {cond.rules.length > 1 && (
                    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                      {[{ v: 'all', l: '全部符合' }, { v: 'any', l: '任一符合' }].map(opt => (
                        <button key={opt.v} onClick={() => updateCond({ logic: opt.v })}
                          className={`btn btn-sm ${cond.logic === opt.v ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, justifyContent: 'center' }}>
                          {opt.l}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Rules */}
                  {cond.rules.map((rule, idx) => {
                    const ruleField = allFields.find(f => f.id === rule.fieldId);
                    return (
                      <div key={idx} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                          {/* Field selector */}
                          <select className="input" value={rule.fieldId} onChange={e => updateRule(idx, { fieldId: e.target.value, value: '' })}
                            style={{ flex: 1, fontSize: 12 }}>
                            <option value="">選擇欄位...</option>
                            {otherFields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                          </select>
                          <button className="btn btn-ghost btn-sm" onClick={() => removeRule(idx)}
                            style={{ padding: '4px 6px', color: 'var(--danger)', flexShrink: 0 }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                        {/* Operator */}
                        <select className="input" value={rule.operator} onChange={e => updateRule(idx, { operator: e.target.value })}
                          style={{ fontSize: 12, marginBottom: 6 }}>
                          {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                        </select>
                        {/* Value (not needed for not_empty) */}
                        {rule.operator !== 'not_empty' && (
                          ruleField && ['select', 'radio', 'checkbox'].includes(ruleField.type) ? (
                            <select className="input" value={rule.value} onChange={e => updateRule(idx, { value: e.target.value })}
                              style={{ fontSize: 12 }}>
                              <option value="">選擇值...</option>
                              {ruleField.options?.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
                            </select>
                          ) : (
                            <input className="input" value={rule.value} onChange={e => updateRule(idx, { value: e.target.value })}
                              placeholder="比較值..." style={{ fontSize: 12 }} />
                          )
                        )}
                      </div>
                    );
                  })}

                  <button className="btn btn-secondary btn-sm" onClick={addRule} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
                    <Plus size={14} /> 新增條件
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FormGroup({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)} style={{
      width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
      background: value ? 'var(--primary)' : 'var(--border)', transition: 'background 0.2s', position: 'relative',
      flexShrink: 0,
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 3, left: value ? 23 : 3, transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}
