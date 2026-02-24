import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Copy, Star } from 'lucide-react';
import { FIELD_TYPES } from '../../utils/fieldTypes';

export default function SortableField({ field, isSelected, onSelect, onDelete, onDuplicate }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const FieldIcon = FIELD_TYPES.find(f => f.type === field.type)?.icon;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="card" onClick={onSelect} style={{
        marginBottom: 10, cursor: 'pointer', padding: '14px 16px',
        border: isSelected ? '2px solid var(--primary)' : '2px solid transparent',
        background: isSelected ? 'var(--primary-light)' : '#fff',
        transition: 'all 0.15s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Drag Handle */}
          <div {...attributes} {...listeners} style={{ cursor: 'grab', color: 'var(--text-3)', flexShrink: 0, padding: 2 }}
            onClick={e => e.stopPropagation()}>
            <GripVertical size={16} />
          </div>

          {/* Field Icon */}
          {FieldIcon && <FieldIcon size={16} color={isSelected ? 'var(--primary)' : 'var(--text-3)'} style={{ flexShrink: 0 }} />}

          {/* Label */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
              {field.label}
              {field.required && <Star size={10} color="var(--danger)" fill="var(--danger)" />}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {FIELD_TYPES.find(f => f.type === field.type)?.label}
              {field.placeholder && ` · ${field.placeholder}`}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button onClick={onDuplicate} className="btn btn-ghost btn-sm" style={{ padding: '4px 6px' }} title="複製欄位">
              <Copy size={14} />
            </button>
            <button onClick={onDelete} className="btn btn-ghost btn-sm" style={{ padding: '4px 6px', color: 'var(--danger)' }} title="刪除欄位">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Options preview for select/radio/checkbox */}
        {['select', 'radio', 'checkbox'].includes(field.type) && field.options?.length > 0 && (
          <div style={{ marginTop: 8, marginLeft: 54, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {field.options.slice(0, 4).map((opt, i) => (
              <span key={i} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--surface-3)', borderRadius: 12, color: 'var(--text-2)' }}>{opt}</span>
            ))}
            {field.options.length > 4 && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>+{field.options.length - 4}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
