# 智慧表單平台 - 模組一：表單設計器

## 📦 本包含什麼

```
form-builder/
├── backend/              # Node.js API 後端
│   ├── src/
│   │   ├── index.js      # 程式進入點
│   │   ├── routes/       # API 路由
│   │   │   ├── auth.js   # 登入 / 使用者管理
│   │   │   ├── forms.js  # 表單 CRUD
│   │   │   └── submissions.js  # 表單提交
│   │   ├── middleware/
│   │   │   └── auth.js   # JWT 驗證中介
│   │   └── models/
│   │       └── db.js     # PostgreSQL 連線
│   ├── init.sql          # 資料庫初始化腳本
│   ├── .env.example      # 環境變數範本
│   └── package.json
└── frontend/             # React 前端
    ├── public/
    │   └── index.html
    └── src/
        ├── App.js         # 路由設定
        ├── index.js       # 程式進入點
        ├── index.css      # 全局樣式
        ├── store/         # Zustand 狀態管理
        ├── pages/
        │   ├── LoginPage.js
        │   ├── DashboardPage.js     # 表單列表
        │   ├── FormBuilderPage.js   # 表單設計器（主要功能）
        │   └── FormFillPage.js      # 表單填寫頁
        ├── components/
        │   ├── Layout.js            # 側邊欄導覽
        │   └── FormBuilder/
        │       ├── SortableField.js # 可拖拉的欄位卡片
        │       ├── FieldEditor.js   # 右側欄位屬性設定
        │       └── FormPreview.js   # 表單預覽
        └── utils/
            └── fieldTypes.js        # 欄位類型定義
```

---

## 🚀 本機啟動步驟

### 第一步：安裝必要環境

確認已安裝：
- Node.js 18+ （https://nodejs.org）
- PostgreSQL 14+ （https://www.postgresql.org/download）

### 第二步：建立資料庫

```bash
# 用 psql 建立資料庫
psql -U postgres -c "CREATE DATABASE form_builder;"

# 執行初始化腳本（建立資料表和預設管理員帳號）
psql -U postgres -d form_builder -f backend/init.sql
```

### 第三步：設定後端環境變數

```bash
cd backend
cp .env.example .env
```

用文字編輯器打開 `.env`，修改以下設定：

```
DB_PASSWORD=你的PostgreSQL密碼
JWT_SECRET=任意一段長隨機字串（例如：abc123xyz789...）
```

### 第四步：啟動後端

```bash
cd backend
npm install
npm run dev
```

看到以下訊息代表成功：
```
✅ 後端 API 啟動於 http://localhost:3001
✅ 資料庫連線成功
```

### 第五步：啟動前端（開新的 terminal）

```bash
cd frontend
npm install
npm start
```

瀏覽器會自動開啟 http://localhost:3000

---

## 🔑 預設帳號

| 欄位 | 值 |
|------|----|
| Email | admin@company.com |
| 密碼 | Admin@1234 |
| 角色 | 超級管理員 |

**⚠️ 上線前務必修改預設密碼！**

---

## ✅ 功能測試清單

啟動後，請照以下步驟驗證功能正常：

1. **登入** → 開啟 http://localhost:3000 → 輸入預設帳號密碼 → 應進入表單列表頁
2. **新增表單** → 點擊「新增表單」→ 從左側點擊欄位類型（如「單行文字」）→ 欄位出現在中間畫布
3. **編輯欄位** → 點擊欄位卡片 → 右側出現欄位設定面板 → 修改名稱、設定必填
4. **拖拉排序** → 拖動欄位左側的 ⠿ 圖示 → 欄位可上下移動
5. **預覽** → 點擊「預覽」Tab → 看到表單的使用者視圖
6. **儲存** → 點擊「儲存」→ 出現「表單已儲存」提示
7. **填寫表單** → 返回列表 → 點擊「填寫」→ 填入資料 → 提交

---

## 🗺️ API 文件

### 認證
| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | /api/auth/login | 登入，回傳 JWT token |
| GET | /api/auth/me | 取得目前登入使用者 |
| GET | /api/auth/users | 取得所有使用者（需管理員） |
| POST | /api/auth/users | 新增使用者（需管理員） |

### 表單
| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | /api/forms | 取得所有表單列表 |
| GET | /api/forms/:id | 取得單一表單（含完整欄位） |
| POST | /api/forms | 新增表單（需管理員） |
| PUT | /api/forms/:id | 更新表單（自動建立版本） |
| DELETE | /api/forms/:id | 停用表單（軟刪除） |
| GET | /api/forms/:id/versions | 取得版本歷史 |

### 提交
| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | /api/submissions | 提交表單資料 |
| GET | /api/submissions | 取得提交記錄（依角色過濾） |

所有 `/api/forms` 和 `/api/submissions` 請求都需要在 Header 加入：
```
Authorization: Bearer <JWT_TOKEN>
```

---

## 🔧 常見問題排除

**問題：後端啟動失敗「cannot connect to database」**
- 確認 PostgreSQL 服務已啟動（Windows: 服務管理員；Mac: `brew services start postgresql`）
- 確認 `.env` 的 DB_PASSWORD 正確
- 確認已建立 `form_builder` 資料庫

**問題：前端顯示「登入失敗」**
- 確認後端已啟動（http://localhost:3001/api/health 應回傳 `{"status":"ok"}`）
- 確認已執行 `init.sql` 建立預設管理員帳號

**問題：npm install 失敗**
- 嘗試刪除 `node_modules` 資料夾後重新執行
- 確認 Node.js 版本 >= 18（`node --version`）

**問題：前端空白頁面**
- 開啟瀏覽器開發人員工具（F12）→ Console 查看錯誤訊息
- 確認前端的 `proxy` 設定（package.json）指向正確的後端 port

---

## 📋 下一個模組預告

**模組二：語音辨識填表（即將交付）**
- 串接 Google Speech-to-Text API
- 即時語音轉文字填入表單欄位
- 支援中文、英文混合辨識

**模組三：CRM 自動寫入引擎**
- Salesforce REST API 整合
- Playwright RPA 自動填表
- 欄位對應設定後台

---

*如有技術問題，請截圖終端機錯誤訊息並提供給技術負責人確認。*
