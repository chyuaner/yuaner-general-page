# Yuaner General Page (Nginx 預設頁產出工具)

本專案旨在為每個 Nginx VHost 站台產生獨立、無外部依賴的單頁 HTML 預設頁面（例如：網站建置中、服務維護中、404 Not Found 等）。

## 核心特點

1. **單一自給自足 HTML 檔**：所有 SCSS 樣式、圖片 (JPEG/PNG)、SVG 圖示與 Favicon 均在構建時自動編譯並轉為 Base64 / SVG 內聯 (Inline) 內嵌至 `.html` 中，零外部 HTTP 請求。
2. **單行極致壓縮 (Minified Single-line)**：`dist/` 產出的 `.html` 檔案經過 `html-minifier-terser` 壓縮為單一行，可直接複製寫死於 Nginx 設定檔中作 `return 200 "..."` ResponseBody 輸出。
3. **極輕量與純粹建置**：放棄重型前端框架，採用純 Node.js + `Eta` 模板引擎 + `marked` 構建，支援邏輯判斷 (`if`) 與組件拆分 (`include`)。
4. **即時開發熱重載**：提供 `npm run dev` 開發伺服器，基於 OS inotify 檔案監聽與 SSE (Server-Sent Events) 技術，檔案儲存即自動即時重載頁面。

---

## 頁面 Frontmatter 設定說明

在 `src/pages/*.md` 的 Frontmatter 中，可以設定以下屬性：

```yaml
---
title: 網站建置中
layout: default
card_title: 網站建置中
card_icon: construction
---
```

| 屬性 | 類型 | 說明 |
| :--- | :--- | :--- |
| `title` | `string` | 頁面 HTML `<title>` 標題 |
| `layout` | `string` | 對應 `src/layouts/` 底下的 HTML 模板（預設為 `default`） |
| `card` | `boolean` | 設定為 `true` 時，將內容包覆在卡片外框 (`status-panel`) 中（無 Header Bar） |
| `card_title` | `string` | 設定卡片頂點標題，自動開啟卡片外框與 Header Bar |
| `card_icon` | `string` | 指定 Header Bar 左側圖示 key（未指定則不顯示圖示） |

---

## 內建 `card_icon` 圖示對照表

系統在 `src/components/card_icon.html` 中預設提供了以下圖示：

| Icon Key | 圖示外觀與語意 | 建議使用場景 |
| :--- | :--- | :--- |
| `dot` | 🟢 動態脈衝綠點 | 服務在線/即時監控/預設狀態 |
| `construction` | 🔧 扳手圖示 | 網站建置中、預設站台、系統維護中 |
| `error` | ⚠️ 錯誤警示三角 | 500 / 502 / 503 伺服器應用程式錯誤 |
| `notfound` | 😟 搜尋無結果 / 苦臉圖示 | 404 Not Found 找不到頁面 |
| `info` | ℹ️ 資訊圓圈 | 系統公告、說明資訊頁面 |
| `server` | 🖥 伺服器機架圖示 | 主機狀態、VHost 機構說明 |
| `lock` | 🔒 鎖頭圖示 | 403 Forbidden、權限受限、私有站台 |
| `warning` | ⚡ 警示圓圈圖示 | 一般系統警告、注意事項 |
| `check` | ✅ 勾選圓圈圖示 | 部署成功、狀態正常 |

---

## 模板與組件設計 (Eta Template Engine)

Layout 位於 `src/layouts/default.html`，支援 Eta 模板語法：

- **組件引入 (Include)**：
  ```html
  <%~ include("../components/navbar.html", it) %>
  ```
- **條件判斷 (If/Else)**：
  ```html
  <% if (it.card_title || it.card) { %>
    <div class="status-panel">
      <% if (it.card_title) { %>
        <div class="status-header">
          <% if (it.card_icon && it.icons && it.icons[it.card_icon]) { %>
            <%~ it.icons[it.card_icon] %>
          <% } else { %>
            <span class="status-dot"></span>
          <% } %>
          <span class="status-label"><%= it.card_title %></span>
        </div>
      <% } %>
      <%~ it.content %>
    </div>
  <% } else { %>
    <%~ it.content %>
  <% } %>
  ```

---

## 指令說明

- **開發模式**：
  ```bash
  npm run dev
  ```
  啟動本地 Dev Server (`http://localhost:3000`)，修改 `src/` 任何檔案將自動重新構建並透過 SSE 即時重載瀏覽器。

- **靜態構建**：
  ```bash
  npm run build
  ```
  將 `src/pages/*.md` 編譯並單行壓縮輸出至 `dist/*.html`。
