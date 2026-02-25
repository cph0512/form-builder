import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import FormBuilderPage from './pages/FormBuilderPage';
import FormFillPage from './pages/FormFillPage';
import UsersPage from './pages/UsersPage';
import DepartmentsPage from './pages/DepartmentsPage';
import SubmissionsPage from './pages/SubmissionsPage';
import CrmConnectionsPage from './pages/CrmConnectionsPage';
import CrmMappingPage from './pages/CrmMappingPage';
import CrmJobsPage from './pages/CrmJobsPage';
import LineBotPage from './pages/LineBotPage';
import CalendarPage from './pages/CalendarPage';
import Layout from './components/Layout';

const ProtectedRoute = ({ children, roles, permission }) => {
  const { token, user, hasPermission } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) return <Navigate to="/" replace />;
  if (permission && !hasPermission(permission)) return <Navigate to="/" replace />;
  return children;
};

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{
        style: { fontFamily: 'Noto Sans TC, sans-serif', fontSize: '14px' }
      }} />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="submissions" element={<SubmissionsPage />} />
          <Route path="builder/new" element={
            <ProtectedRoute roles={['super_admin', 'dept_admin']}>
              <FormBuilderPage />
            </ProtectedRoute>
          } />
          <Route path="builder/:id" element={
            <ProtectedRoute roles={['super_admin', 'dept_admin']}>
              <FormBuilderPage />
            </ProtectedRoute>
          } />
          <Route path="fill/:id" element={<FormFillPage />} />
          <Route path="users" element={
            <ProtectedRoute roles={['super_admin', 'dept_admin']}>
              <UsersPage />
            </ProtectedRoute>
          } />
          <Route path="departments" element={
            <ProtectedRoute roles={['super_admin']}>
              <DepartmentsPage />
            </ProtectedRoute>
          } />
          <Route path="crm/connections" element={
            <ProtectedRoute permission="crm_connections">
              <CrmConnectionsPage />
            </ProtectedRoute>
          } />
          <Route path="crm/mapping" element={
            <ProtectedRoute permission="crm_mapping">
              <CrmMappingPage />
            </ProtectedRoute>
          } />
          <Route path="crm/jobs" element={
            <ProtectedRoute permission="crm_jobs">
              <CrmJobsPage />
            </ProtectedRoute>
          } />
          <Route path="linebot" element={
            <ProtectedRoute permission="linebot_manage">
              <LineBotPage />
            </ProtectedRoute>
          } />
          <Route path="calendar" element={
            <ProtectedRoute permission="linebot_manage">
              <CalendarPage />
            </ProtectedRoute>
          } />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
