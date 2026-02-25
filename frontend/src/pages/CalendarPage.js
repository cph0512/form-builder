import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const TYPE_LABEL = {
  birthday:   { text: '生日',   color: '#ec4899', bg: '#fdf2f8' },
  test_drive: { text: '試駕',   color: '#f59e0b', bg: '#fffbeb' },
  follow_up:  { text: '跟進',   color: '#3b82f6', bg: '#eff6ff' },
  contract:   { text: '合約',   color: '#8b5cf6', bg: '#f5f3ff' },
  custom:     { text: '自訂',   color: '#10b981', bg: '#ecfdf5' },
};

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export default function CalendarPage() {
  const [reminders, setReminders]     = useState([]);
  const [icalToken, setIcalToken]     = useState(null);
  const [loading, setLoading]         = useState(true);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [copied, setCopied]           = useState(false);
  const [viewDate, setViewDate]       = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);

  const apiBase = process.env.REACT_APP_API_URL || '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [remRes, tokenRes] = await Promise.all([
        axios.get('/api/linebot/reminders'),
        axios.get('/api/auth/me/ical-token'),
      ]);
      setReminders(remRes.data);
      setIcalToken(tokenRes.data.token);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ─── iCal URL ───────────────────────────────────────────────────
  const icalUrl = icalToken
    ? `${apiBase}/api/linebot/reminders/ical/${icalToken}`
    : '';

  const handleCopy = () => {
    if (!icalUrl) return;
    navigator.clipboard.writeText(icalUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleRegenToken = async () => {
    if (!window.confirm('重新產生後，舊的訂閱連結將失效，行事曆 App 需要重新加入新連結，確定嗎？')) return;
    setTokenLoading(true);
    try {
      const { data } = await axios.post('/api/auth/me/ical-token');
      setIcalToken(data.token);
    } finally {
      setTokenLoading(false);
    }
  };

  // ─── 月曆邏輯 ──────────────────────────────────────────────────
  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth(); // 0-indexed

  const firstDay  = new Date(year, month, 1).getDay(); // 0=日
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // 把提醒依日期分組
  const remindersByDate = {};
  reminders.forEach(r => {
    const d = new Date(r.trigger_at);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const key = d.getDate();
      if (!remindersByDate[key]) remindersByDate[key] = [];
      remindersByDate[key].push(r);
    }
  });

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const today = new Date();

  // 接下來 14 天的提醒
  const upcoming = reminders
    .filter(r => {
      const d = new Date(r.trigger_at);
      return d >= today && d <= new Date(today.getTime() + 14 * 86400000);
    })
    .sort((a, b) => new Date(a.trigger_at) - new Date(b.trigger_at));

  const selectedReminders = selectedDay ? (remindersByDate[selectedDay] || []) : [];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div style={{ color: '#94a3b8' }}>載入中...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* 頁面標題 */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>📅 行事曆</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
          提醒排程（手動建立 + AI 對話產生）均顯示於此，可訂閱至外部行事曆 App
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
        {/* 左欄：月曆 */}
        <div>
          {/* 月份導航 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <button onClick={prevMonth} style={navBtnStyle}>‹</button>
            <span style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>
              {year} 年 {month + 1} 月
            </span>
            <button onClick={nextMonth} style={navBtnStyle}>›</button>
          </div>

          {/* 星期標題 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
            {WEEKDAYS.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#94a3b8', padding: '6px 0' }}>
                {d}
              </div>
            ))}
          </div>

          {/* 日期格子 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {/* 空格（第一天之前）*/}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} style={dayCellStyle(false, false, false)} />
            ))}
            {/* 實際日期 */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
              const isSelected = selectedDay === day;
              const dayReminders = remindersByDate[day] || [];
              return (
                <div
                  key={day}
                  onClick={() => setSelectedDay(isSelected ? null : day)}
                  style={dayCellStyle(isToday, isSelected, dayReminders.length > 0)}
                >
                  <span style={{ fontSize: 13, fontWeight: isToday ? 700 : 400 }}>{day}</span>
                  {/* 提醒小點 */}
                  {dayReminders.length > 0 && (
                    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginTop: 3 }}>
                      {dayReminders.slice(0, 3).map(r => (
                        <div
                          key={r.id}
                          style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: TYPE_LABEL[r.type]?.color || '#64748b',
                          }}
                        />
                      ))}
                      {dayReminders.length > 3 && (
                        <span style={{ fontSize: 9, color: '#94a3b8' }}>+{dayReminders.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 選中日期的提醒 */}
          {selectedDay && (
            <div style={{ marginTop: 20, background: '#f8fafc', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 12 }}>
                {month + 1} 月 {selectedDay} 日 的提醒
              </div>
              {selectedReminders.length === 0 ? (
                <div style={{ fontSize: 13, color: '#94a3b8' }}>這天沒有提醒</div>
              ) : (
                selectedReminders.map(r => <ReminderCard key={r.id} r={r} />)
              )}
            </div>
          )}

          {/* 色彩圖例 */}
          <div style={{ marginTop: 20, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {Object.entries(TYPE_LABEL).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: v.color }} />
                {v.text}
              </div>
            ))}
          </div>
        </div>

        {/* 右欄 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 接下來 14 天 */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 12 }}>
              接下來 14 天
            </div>
            {upcoming.length === 0 ? (
              <div style={{ fontSize: 12, color: '#94a3b8' }}>近期沒有提醒</div>
            ) : (
              upcoming.map(r => <ReminderCard key={r.id} r={r} compact />)
            )}
          </div>

          {/* iCal 訂閱 */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
              📲 訂閱到行事曆 App
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>
              把以下連結加到 Google Calendar / Apple Calendar / Outlook，提醒將自動同步
            </div>

            {/* 連結 */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                readOnly
                value={icalUrl}
                style={{
                  flex: 1, fontSize: 11, padding: '8px 10px',
                  border: '1px solid #e2e8f0', borderRadius: 8,
                  background: '#f8fafc', color: '#475569', minWidth: 0,
                }}
              />
              <button onClick={handleCopy} style={copyBtnStyle(copied)}>
                {copied ? '✓ 已複製' : '複製'}
              </button>
            </div>

            {/* 各平台說明 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <PlatformGuide
                icon="🔵"
                name="Google Calendar"
                steps={['打開 Google Calendar', '左側點「其他日曆」旁的 ＋', '選「透過網址」', '貼上連結 → 新增日曆']}
              />
              <PlatformGuide
                icon="🍎"
                name="Apple Calendar (iOS)"
                steps={['設定 → 日曆 → 帳號', '新增帳號 → 其他', '新增已訂閱的日曆', '貼上連結 → 繼續']}
              />
              <PlatformGuide
                icon="📘"
                name="Outlook"
                steps={['新增日曆 → 從網際網路', '貼上連結 → 確定']}
              />
            </div>

            {/* 重新產生 */}
            <button
              onClick={handleRegenToken}
              disabled={tokenLoading}
              style={{
                marginTop: 14, width: '100%', padding: '8px 0',
                fontSize: 12, color: '#ef4444', background: 'transparent',
                border: '1px solid #fecaca', borderRadius: 8, cursor: 'pointer',
              }}
            >
              {tokenLoading ? '處理中...' : '🔄 重新產生連結（舊連結失效）'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 子元件 ──────────────────────────────────────────────────────

function ReminderCard({ r, compact }) {
  const t = TYPE_LABEL[r.type] || { text: r.type, color: '#64748b', bg: '#f8fafc' };
  const dt = new Date(r.trigger_at);
  const dateStr = `${dt.getMonth() + 1}/${dt.getDate()} ${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: compact ? '8px 0' : '10px 12px',
      borderBottom: '1px solid #f1f5f9',
      background: compact ? 'transparent' : t.bg,
      borderRadius: compact ? 0 : 10,
      marginBottom: compact ? 0 : 8,
    }}>
      <div style={{
        flexShrink: 0, width: compact ? 6 : 8, height: compact ? 6 : 8,
        borderRadius: '50%', background: t.color, marginTop: 4,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>
          {r.label || t.text}
        </div>
        <div style={{ fontSize: 11, color: '#64748b' }}>{dateStr}</div>
        {!compact && (
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.message_template}
          </div>
        )}
      </div>
      <span style={{ fontSize: 10, color: t.color, background: t.bg, border: `1px solid ${t.color}30`, borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
        {t.text}
      </span>
    </div>
  );
}

function PlatformGuide({ icon, name, steps }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: 12, fontWeight: 600, color: '#374151',
        }}
      >
        <span>{icon} {name}</span>
        <span style={{ fontSize: 10, color: '#94a3b8' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 12px 10px', background: '#f8fafc' }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11, color: '#475569', marginBottom: 4 }}>
              <span style={{ color: '#94a3b8', minWidth: 14 }}>{i + 1}.</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 樣式 ────────────────────────────────────────────────────────

const navBtnStyle = {
  width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0',
  background: '#fff', cursor: 'pointer', fontSize: 18, color: '#475569',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

function dayCellStyle(isToday, isSelected, hasReminders) {
  return {
    minHeight: 56, padding: '6px 4px', borderRadius: 8, cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    background: isSelected ? '#3b82f6' : isToday ? '#eff6ff' : hasReminders ? '#f8fafc' : 'transparent',
    border: isToday && !isSelected ? '2px solid #3b82f6' : '1px solid transparent',
    color: isSelected ? '#fff' : '#0f172a',
    transition: 'background 0.15s',
  };
}

function copyBtnStyle(copied) {
  return {
    flexShrink: 0, padding: '8px 12px', fontSize: 12, fontWeight: 600,
    background: copied ? '#10b981' : '#3b82f6', color: '#fff',
    border: 'none', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}
