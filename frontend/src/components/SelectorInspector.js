/**
 * SelectorInspector — CSS Selector 測試工具
 *
 * 使用方式：
 *   const inspector = useSelectorInspector();
 *   ...
 *   <InspectorBtn onClick={() => inspector.open(url, selector)} />
 *   <SelectorInspectorModal inspector={inspector} />
 */
import React, { useState } from 'react';
import axios from 'axios';
import { X, Search, Loader, CheckCircle, XCircle, Info } from 'lucide-react';

/* ── Hook ── */
export function useSelectorInspector() {
  const [state, setState] = useState({
    open: false,
    url: '',
    selector: '',
    result: null,
    loading: false,
  });

  const open = (url = '', selector = '') =>
    setState({ open: true, url: url || '', selector: selector || '', result: null, loading: false });

  const close = () => setState((s) => ({ ...s, open: false, result: null }));

  const run = async (url, selector) => {
    setState((s) => ({ ...s, url, selector, loading: true, result: null }));
    try {
      const res = await axios.post('/api/crm/connections/inspect-selector', { url, selector });
      setState((s) => ({ ...s, loading: false, result: res.data }));
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        result: {
          count: 0,
          error: err.response?.data?.error || '連線失敗，請確認後端是否正常運行',
          screenshot: null,
        },
      }));
    }
  };

  return { state, setState, open, close, run };
}

/* ── 觸發按鈕（放在 Selector input 旁邊） ── */
export function InspectorBtn({ onClick, disabled = false, title = '截圖測試此 Selector' }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 36,
        width: 36,
        flexShrink: 0,
        border: `1px solid ${hover ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: 6,
        background: hover ? 'var(--primary-light, #ede9fe)' : 'transparent',
        color: hover ? 'var(--primary)' : 'var(--text-3)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'all 0.15s',
      }}
    >
      <Search size={13} />
    </button>
  );
}

/* ── Modal ── */
export function SelectorInspectorModal({ inspector }) {
  const { state, setState, close, run } = inspector;
  if (!state.open) return null;

  const { url, selector, result, loading } = state;
  const canRun = url.trim() && selector.trim() && !loading;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 3000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: 820, padding: 26, maxHeight: '92vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }}>🔍 CSS Selector 測試工具</h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
              輸入網址與 Selector，截圖確認元素是否正確命中
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={close}>
            <X size={16} />
          </button>
        </div>

        {/* How-to hint */}
        <div
          style={{
            padding: '10px 14px',
            background: '#eff6ff',
            borderRadius: 8,
            fontSize: 12,
            color: '#1e40af',
            marginBottom: 18,
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            lineHeight: 1.7,
          }}
        >
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <b>如何取得 CSS Selector：</b> 在 Chrome 開啟目標 CRM 頁面 → 按 <code>F12</code> 開啟 DevTools
            → Elements 面板點選目標元素 → 右鍵節點 → <b>Copy → Copy selector</b>
            <br />
            也可以試試簡單的寫法，例如 <code>input[name="email"]</code>、<code>#loginBtn</code>、<code>.save-btn</code>
          </span>
        </div>

        {/* URL input */}
        <div style={{ marginBottom: 14 }}>
          <label className="label">目標網址</label>
          <input
            className="input"
            placeholder="https://your-crm.example.com/login"
            value={url}
            onChange={(e) => setState((s) => ({ ...s, url: e.target.value, result: null }))}
          />
        </div>

        {/* Selector input + run button */}
        <div style={{ marginBottom: 20 }}>
          <label className="label">CSS Selector</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              style={{ flex: 1, fontFamily: 'monospace', fontSize: 13 }}
              placeholder="input[name='username']   /   button.login-btn   /   #save-button"
              value={selector}
              onChange={(e) => setState((s) => ({ ...s, selector: e.target.value, result: null }))}
              onKeyDown={(e) => e.key === 'Enter' && canRun && run(url, selector)}
            />
            <button
              className="btn btn-primary"
              style={{ flexShrink: 0 }}
              disabled={!canRun}
              onClick={() => run(url, selector)}
            >
              {loading ? (
                <>
                  <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  截圖中...
                </>
              ) : (
                <>
                  <Search size={14} />
                  執行測試
                </>
              )}
            </button>
          </div>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div
            style={{
              height: 200,
              borderRadius: 8,
              background: 'var(--surface-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              color: 'var(--text-2)',
              fontSize: 14,
            }}
          >
            <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
            Playwright 正在開啟瀏覽器並截圖，請稍候...
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18 }}>
            {/* Status badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              {result.count > 0 ? (
                <>
                  <CheckCircle size={20} color="#10b981" />
                  <div>
                    <span style={{ color: '#10b981', fontWeight: 700, fontSize: 15 }}>
                      ✓ 找到 {result.count} 個符合的元素
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--text-2)', marginLeft: 8 }}>
                      （已用紅框標示在截圖中）
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <XCircle size={20} color="var(--danger)" />
                  <span style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 15 }}>
                    {result.error ? `錯誤：${result.error}` : '找不到符合的元素，請修正 Selector'}
                  </span>
                </>
              )}
            </div>

            {/* Element attributes */}
            {result.firstElementInfo && (
              <div
                style={{
                  background: 'var(--surface-2)',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 16,
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  第一個命中元素的屬性
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 24px', fontFamily: 'monospace', fontSize: 12 }}>
                  <span>
                    tag: <b style={{ color: '#7c3aed' }}>&lt;{result.firstElementInfo.tagName}&gt;</b>
                  </span>
                  {result.firstElementInfo.type && (
                    <span>
                      type: <b style={{ color: '#0369a1' }}>{result.firstElementInfo.type}</b>
                    </span>
                  )}
                  {result.firstElementInfo.name && (
                    <span>
                      name: <b style={{ color: '#0369a1' }}>{result.firstElementInfo.name}</b>
                    </span>
                  )}
                  {result.firstElementInfo.id && (
                    <span>
                      id: <b style={{ color: '#0369a1' }}>#{result.firstElementInfo.id}</b>
                    </span>
                  )}
                  {result.firstElementInfo.placeholder && (
                    <span>
                      placeholder: <b style={{ color: '#065f46' }}>"{result.firstElementInfo.placeholder}"</b>
                    </span>
                  )}
                  {result.firstElementInfo.text && (
                    <span>
                      text: <b style={{ color: '#92400e' }}>"{result.firstElementInfo.text.slice(0, 50)}"</b>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Screenshot */}
            {result.screenshot && (
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>
                  頁面截圖（命中元素以紅框標示）：
                  {result.finalUrl && result.finalUrl !== url && (
                    <span style={{ marginLeft: 8, color: '#f59e0b' }}>
                      ⚠ 頁面已重新導向至 {result.finalUrl}
                    </span>
                  )}
                </div>
                <img
                  src={`data:image/jpeg;base64,${result.screenshot}`}
                  alt="Selector 截圖預覽"
                  style={{
                    width: '100%',
                    display: 'block',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
                  }}
                />
              </div>
            )}
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
