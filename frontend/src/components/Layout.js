import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store';
import { LayoutDashboard, FileText, PlusCircle, LogOut, ChevronRight, User, Users, Building2, ClipboardList, Database, ArrowLeftRight, Activity, MessageSquare } from 'lucide-react';

const ROLE_LABELS = {
  super_admin: '超級管理員',
  dept_admin: '部門管理員',
  manager: '主管',
  staff: '一般人員',
};

export default function Layout() {
  const { user, logout, hasPermission } = useAuthStore();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  const canCreate = ['super_admin', 'dept_admin'].includes(user?.role);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{
        width: collapsed ? 64 : 240,
        background: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease',
        flexShrink: 0,
        position: 'relative',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: '#1a56db', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FileText size={16} color="#fff" />
          </div>
          {!collapsed && <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap' }}>智慧表單平台</span>}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          {!collapsed && <SectionLabel>表單</SectionLabel>}
          <NavItem to="/" icon={<LayoutDashboard size={18} />} label="表單總覽" collapsed={collapsed} />
          <NavItem to="/submissions" icon={<ClipboardList size={18} />} label="提交記錄" collapsed={collapsed} />
          {canCreate && (
            <NavItem to="/builder/new" icon={<PlusCircle size={18} />} label="新增表單" collapsed={collapsed} />
          )}

          {canCreate && (
            <>
              {!collapsed ? <SectionLabel style={{ marginTop: 8 }}>系統管理</SectionLabel> : <Divider />}
              <NavItem to="/users" icon={<Users size={18} />} label="使用者管理" collapsed={collapsed} />
              {user?.role === 'super_admin' && (
                <NavItem to="/departments" icon={<Building2 size={18} />} label="部門管理" collapsed={collapsed} />
              )}
            </>
          )}

          {(hasPermission('crm_connections') || hasPermission('crm_mapping') || hasPermission('crm_jobs')) && (
            <>
              {!collapsed ? <SectionLabel style={{ marginTop: 8 }}>CRM 整合</SectionLabel> : <Divider />}
              {hasPermission('crm_connections') && <NavItem to="/crm/connections" icon={<Database size={18} />} label="CRM 連線" collapsed={collapsed} />}
              {hasPermission('crm_mapping') && <NavItem to="/crm/mapping" icon={<ArrowLeftRight size={18} />} label="欄位對應" collapsed={collapsed} />}
              {hasPermission('crm_jobs') && <NavItem to="/crm/jobs" icon={<Activity size={18} />} label="任務監控" collapsed={collapsed} />}
            </>
          )}

          {hasPermission('linebot_manage') && (
            <>
              {!collapsed ? <SectionLabel style={{ marginTop: 8 }}>LINE Bot</SectionLabel> : <Divider />}
              <NavItem to="/linebot" icon={<MessageSquare size={18} />} label="LINE Bot 管理" collapsed={collapsed} />
            </>
          )}
        </nav>

        {/* User info */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {!collapsed && (
            <div style={{ padding: '8px 10px', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, background: '#1a56db', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <User size={16} color="#fff" />
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
                  <div style={{ color: '#64748b', fontSize: 11 }}>{ROLE_LABELS[user?.role]}</div>
                </div>
              </div>
            </div>
          )}
          <button onClick={handleLogout} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px', background: 'transparent', border: 'none', borderRadius: 8,
            color: '#94a3b8', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit',
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}
          >
            <LogOut size={16} />
            {!collapsed && <span>登出</span>}
          </button>
        </div>

        {/* Collapse button */}
        <button onClick={() => setCollapsed(!collapsed)} style={{
          position: 'absolute', right: -12, top: '50%', transform: 'translateY(-50%)',
          width: 24, height: 24, background: '#1e293b', border: '1px solid #334155',
          borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#94a3b8', transition: 'all 0.2s', zIndex: 10,
        }}>
          <ChevronRight size={12} style={{ transform: collapsed ? 'none' : 'rotate(180deg)', transition: 'transform 0.2s' }} />
        </button>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'auto', background: '#f8fafc' }}>
        <Outlet />
      </main>
    </div>
  );
}

function SectionLabel({ children, style }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 10px 6px', marginBottom: 2, ...style }}>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '8px 0' }} />;
}

function NavItem({ to, icon, label, collapsed }) {
  return (
    <NavLink to={to} end={to === '/'} style={({ isActive }) => ({
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
      borderRadius: 8, textDecoration: 'none', marginBottom: 2,
      color: isActive ? '#fff' : '#94a3b8',
      background: isActive ? 'rgba(26,86,219,0.3)' : 'transparent',
      fontSize: 14, fontWeight: isActive ? 600 : 400,
      transition: 'all 0.15s', whiteSpace: 'nowrap', overflow: 'hidden',
    })}>
      <span style={{ flexShrink: 0 }}>{icon}</span>
      {!collapsed && label}
    </NavLink>
  );
}
