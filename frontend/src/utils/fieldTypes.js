import { Type, Hash, AlignLeft, List, CheckSquare, ChevronDown, Calendar, Phone, Mail, MapPin, Mic, Image, Pen, CreditCard } from 'lucide-react';

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
  { type: 'id_number', label: '身分證字號', icon: CreditCard, description: '台灣身分證字號格式驗證' },
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
  id_number: (v) => {
    if (!v) return true;
    const ID_LETTER_MAP = {
      A:10, B:11, C:12, D:13, E:14, F:15, G:16, H:17, I:34, J:18, K:19,
      L:20, M:21, N:22, O:35, P:23, Q:24, R:25, S:26, T:27, U:28, V:29,
      W:32, X:30, Y:31, Z:33,
    };
    const val = v.trim().toUpperCase();
    if (!/^[A-Z][12]\d{8}$/.test(val)) return '請輸入有效的身分證字號';
    const letterCode = ID_LETTER_MAP[val[0]];
    // digits: 展開字母為兩位數 + val[1]~val[8]（共10位）
    const digits = [
      Math.floor(letterCode / 10),
      letterCode % 10,
      ...val.slice(1, 9).split('').map(Number),
    ];
    const weights = [1, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    const checkDigit = Number(val[9]);
    const sum = digits.reduce((acc, d, i) => acc + d * weights[i], 0);
    return (sum + checkDigit) % 10 === 0 || '身分證字號驗證碼錯誤';
  },
};
// conditions default already set in createField above
