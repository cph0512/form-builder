import { Type, Hash, AlignLeft, List, CheckSquare, ChevronDown, Calendar, Phone, Mail, MapPin, Mic, Image, Pen } from 'lucide-react';

// 所有支援的欄位類型
export const FIELD_TYPES = [
  { type: 'text', label: '單行文字', icon: Type, description: '姓名、標題等簡短文字' },
  { type: 'textarea', label: '多行文字', icon: AlignLeft, description: '備註、說明等長文字' },
  { type: 'number', label: '數字', icon: Hash, description: '金額、數量等數值' },
  { type: 'phone', label: '電話號碼', icon: Phone, description: '格式驗證的電話欄位' },
  { type: 'email', label: 'Email', icon: Mail, description: '格式驗證的電子郵件' },
  { type: 'date', label: '日期', icon: Calendar, description: '日期選擇器' },
  { type: 'select', label: '下拉選單', icon: ChevronDown, description: '單選下拉式選單' },
  { type: 'radio', label: '單選按鈕', icon: List, description: '可見的單選選項' },
  { type: 'checkbox', label: '多選方塊', icon: CheckSquare, description: '可複選的選項' },
  { type: 'address', label: '地址', icon: MapPin, description: '地址輸入欄位' },
  { type: 'voice', label: '語音輸入', icon: Mic, description: '語音辨識自動填入' },
  { type: 'image', label: '圖片上傳', icon: Image, description: '上傳圖片或拍照' },
  { type: 'signature', label: '電子簽名', icon: Pen, description: '手寫簽名欄位' },
];

// 建立新欄位的預設值
export const createField = (type) => ({
  id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  type,
  label: FIELD_TYPES.find(f => f.type === type)?.label || '新欄位',
  placeholder: '',
  required: false,
  options: ['select', 'radio', 'checkbox'].includes(type) ? ['選項一', '選項二', '選項三'] : [],
  validation: {},
  helpText: '',
  conditions: { enabled: false, logic: 'all', rules: [] },
});

// 各欄位類型的渲染設定（在填表頁使用）
export const FIELD_VALIDATORS = {
  email: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || '請輸入有效的 Email',
  phone: (v) => !v || /^[0-9+\-\s()]{7,15}$/.test(v) || '請輸入有效的電話號碼',
  number: (v) => !v || !isNaN(v) || '請輸入數字',
};
// conditions default already set in createField above
