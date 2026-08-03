# Yuaner General Page (Nginx 預設頁產出工具)

本專案旨在為每個 Nginx VHost 站台產生獨立、無外部依賴的單頁 HTML 預設頁面（例如：網站建置中、服務維護中、404 Not Found 等）。

<picture>
  <!-- 當 GitHub 處於 Dark Mode 時顯示這張 -->
  <source media="(prefers-color-scheme: dark)" srcset=".readme/Screenshot 2026-08-03 at 14-21-36 全新尚未有內容的網站 (Edit).png">
  <!-- 預設 / 當 GitHub 處於 Light Mode 時顯示這張 -->
  <img alt="Project Screenshot" src=".readme/Screenshot 2026-08-03 at 14-21-33 全新尚未有內容的網站 (Edit).png">
</picture>

本專案主要用途是新創vhost時，若還沒有內容時，可拿這個專案的網頁先當作比較體面的過渡，所以Nginx設定力求簡單。

在這個前提下，不能有任何外連檔案，必須單一一份 .html 檔案就要解決（不能外連JS和CSS）。
然後又受限Nginx直接大字串輸出限制（最多4082個字），只要內含圖片就一定爆，當然JS邏輯也不能太多（不過我最後處理到無JS了）。

## 核心特點

* **單一自給自足 HTML 檔**：所有 SCSS 樣式均在構建時編譯並內嵌至 `.html` 中，零外部 HTTP 請求。
* **Nginx 與編輯器友善的精簡輸出**：`dist/` 產出的 `.html` 檔案經過適度壓縮與行數分流，**總字數控制在 4082 字元以內**，具小體積特色可直接貼入 Nginx `return 200 "..."`。

### 開發方面的核心特點
* **Markdown內容維護**: 所有內容都放在 `/src/pages/` 下，可直接用 Markdown 編輯。
* **極輕量與純粹建置**：放棄重型前端框架，採用純 Node.js + `Eta` 模板引擎 + `marked` 構建，支援邏輯判斷 (`if`) 與組件拆分 (`include`)。
* **即時開發熱重載**：提供 `npm run dev` 開發伺服器，基於 OS inotify 檔案監聽與 SSE (Server-Sent Events) 技術，檔案儲存即自動即時重載頁面。
* **字數爆掉警告機能**: 在Build時，若輸出檔總字數已經超過4082 字元，將會在終端跳出警告。若是在Github Actions，會在「Annotations」出現警告。

---

## 頁面 Frontmatter 設定說明

在 `src/pages/*.md` 的 Frontmatter 中，可以設定以下屬性：

```yaml
---
title: 網站建置中
layout: default
card_title: 網站建置中
card_dot: '#a3be8c'
---
```

| 屬性 | 類型 | 說明 |
| :--- | :--- | :--- |
| `title` | `string` | 頁面 HTML `<title>` 標題 |
| `layout` | `string` | 對應 `src/layouts/` 底下的 HTML 模板（預設為 `default`） |
| `card` | `boolean` | 設定為 `true` 時，將內容包覆在卡片外框 (`status-panel`) 中（無 Header Bar） |
| `card_title` | `string` | 設定卡片頂點標題，自動開啟卡片外框與 Header Bar |
| `card_dot` | `string` | Header Bar 左側狀態圓點的 CSS 顏色（例如 `#a3be8c`），未指定則不顯示圓點 |

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
          <% if (it.card_dot) { %>
            <span class="status-dot" style="background:<%= it.card_dot %>"></span>
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

---

## 自動化部署

Push 至 `master` 分支後，GitHub Actions 會自動：

1. 執行 `npm run build` 產生 `dist/` 檔案
2. 以 commit SHA 建立 GitHub Release 並上傳 `.html` 附件
3. 部署至 GitHub Pages
