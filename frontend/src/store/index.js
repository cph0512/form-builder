import { create } from 'zustand';
import axios from 'axios';

// 生產環境指向 Railway 後端
if (process.env.REACT_APP_API_URL) {
  axios.defaults.baseURL = process.env.REACT_APP_API_URL;
}

// 設定 axios 預設 token
const setAuthHeader = (token) => {
  if (token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common['Authorization'];
  }
};

// 全域攔截器：token 失效時自動登出
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      delete axios.defaults.headers.common['Authorization'];
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// 初始化：從 localStorage 讀取已存的 token
const storedToken = localStorage.getItem('token');
const storedUser = localStorage.getItem('user');
if (storedToken) setAuthHeader(storedToken);

export const useAuthStore = create((set) => ({
  token: storedToken || null,
  user: storedUser ? JSON.parse(storedUser) : null,
  isLoading: false,

  login: async (email, password) => {
    set({ isLoading: true });
    const res = await axios.post('/api/auth/login', { email, password });
    const { token, user } = res.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setAuthHeader(token);
    set({ token, user, isLoading: false });
    return user;
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setAuthHeader(null);
    set({ token: null, user: null });
  },
}));

// 表單管理 store
export const useFormStore = create((set, get) => ({
  forms: [],
  currentForm: null,
  isLoading: false,

  fetchForms: async () => {
    set({ isLoading: true });
    try {
      const res = await axios.get('/api/forms');
      set({ forms: res.data, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
    }
  },

  fetchForm: async (id) => {
    const res = await axios.get(`/api/forms/${id}`);
    set({ currentForm: res.data });
    return res.data;
  },

  saveForm: async (formData) => {
    if (formData.id) {
      const res = await axios.put(`/api/forms/${formData.id}`, formData);
      set((state) => ({
        forms: state.forms.map(f => f.id === formData.id ? res.data : f),
        currentForm: res.data
      }));
      return res.data;
    } else {
      const res = await axios.post('/api/forms', formData);
      set((state) => ({ forms: [res.data, ...state.forms] }));
      return res.data;
    }
  },

  toggleFormStatus: async (formId) => {
    const res = await axios.patch(`/api/forms/${formId}/status`);
    set((state) => ({
      forms: state.forms.map(f => f.id === formId ? { ...f, is_active: res.data.is_active } : f),
    }));
    return res.data;
  },
}));

// 使用者管理 store
export const useUserStore = create((set) => ({
  users: [],
  isLoading: false,

  fetchUsers: async () => {
    set({ isLoading: true });
    try {
      const res = await axios.get('/api/auth/users');
      set({ users: res.data, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
    }
  },

  createUser: async (data) => {
    const res = await axios.post('/api/auth/users', data);
    set((state) => ({ users: [{ ...res.data, is_active: true }, ...state.users] }));
    return res.data;
  },

  updateUser: async (id, data) => {
    const res = await axios.put(`/api/auth/users/${id}`, data);
    set((state) => ({
      users: state.users.map(u => u.id === id ? { ...u, ...res.data } : u),
    }));
    return res.data;
  },

  toggleUserStatus: async (id) => {
    const res = await axios.patch(`/api/auth/users/${id}/status`);
    set((state) => ({
      users: state.users.map(u => u.id === id ? { ...u, is_active: res.data.is_active } : u),
    }));
    return res.data;
  },

  resetPassword: async (id, password) => {
    await axios.put(`/api/auth/users/${id}/password`, { password });
  },
}));

// 部門管理 store
export const useDeptStore = create((set) => ({
  departments: [],
  isLoading: false,

  fetchDepartments: async () => {
    set({ isLoading: true });
    try {
      const res = await axios.get('/api/departments');
      set({ departments: res.data, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
    }
  },

  createDepartment: async (data) => {
    const res = await axios.post('/api/departments', data);
    set((state) => ({ departments: [...state.departments, res.data] }));
    return res.data;
  },

  updateDepartment: async (id, data) => {
    const res = await axios.put(`/api/departments/${id}`, data);
    set((state) => ({
      departments: state.departments.map(d => d.id === id ? { ...d, ...res.data } : d),
    }));
    return res.data;
  },

  deleteDepartment: async (id) => {
    await axios.delete(`/api/departments/${id}`);
    set((state) => ({
      departments: state.departments.filter(d => d.id !== id),
    }));
  },
}));
