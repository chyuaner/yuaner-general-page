import fs from 'node:fs/promises';
import path from 'node:path';

// ─── File Description Mapping (Key-by-Value) ──────────────────────────────
const FILE_DESCRIPTIONS = {
  'index.html': '通用「網站建置中」頁面',
  '404.html': '通用「404 Not Found」頁面'
};

const repo = process.env.GITHUB_REPOSITORY || 'chyuaner/yuaner-general-page';
const shaFull = process.env.GITHUB_SHA || 'master';
const shaShort = shaFull.slice(0, 7);

// UTC+8 Date formatting: YYYYMMDD
const now = new Date();
const tzOffset = 8 * 60; // minutes
const localTime = new Date(now.getTime() + (now.getTimezoneOffset() + tzOffset) * 60000);
const yyyymmdd = localTime.toISOString().slice(0, 10).replace(/-/g, '');

const distDir = path.join(process.cwd(), 'dist');
const files = (await fs.readdir(distDir)).filter(f => f.endsWith('.html'));

// Sort order: index.html first, 404.html second, others alphabetically
files.sort((a, b) => {
  if (a === 'index.html') return -1;
  if (b === 'index.html') return 1;
  if (a === '404.html') return -1;
  if (b === '404.html') return 1;
  return a.localeCompare(b);
});

let body = `${yyyymmdd} 更新版本: ${shaShort}
===

以 ${shaFull} 版本自動建置

所有已產出的每一份HTML檔案，都可自給自足單獨使用，無需依賴任何對外連網使用外部資源，與內部其他任何圖片、CSS、JS檔案等，都在構件編譯時，皆已內嵌在HTML檔案中。


## 使用方式
### 直接寫死進Nginx設定檔：直接寫死固定的Response Body內容

#### Step1. 複製各個檔案的內容
以下是各個檔案的內容，請按照實際情況貼上到Nginx設定檔中：

`;

for (const file of files) {
  const desc = FILE_DESCRIPTIONS[file] ? ` ${FILE_DESCRIPTIONS[file]}` : '';
  const content = await fs.readFile(path.join(distDir, file), 'utf-8');
  body += `##### ${file}${desc}
\`\`\`html ${file}
${content}
\`\`\`

`;
}

body += `#### Step2. 貼到Nginx設定檔
Nginx設定檔基本範例：

\`\`\`
server {
    listen 80;
    # server_name localhost;

    location / {
        # 指定 Content-Type 為 text/html，否則瀏覽器可能會將內容當成純文字下載或顯示
        default_type text/html;

        # 直接回傳 HTTP Code 200 以及對應的 HTML 內容
        return 200 '<請按照上述內容貼在此處>';
    }
}
\`\`\`


### 使用 alias 或 try_files 讀取實體檔

#### Step1. 下載你需要的檔案到Nginx的實體檔案目錄

請先 `cd` 到你要放置的當前目錄（例如： `/var/www/html`），再執行以下指令
`;

for (const file of files) {
  const desc = FILE_DESCRIPTIONS[file] ? ` ${FILE_DESCRIPTIONS[file]}` : '';
  const rawUrl = `https://raw.githubusercontent.com/${repo}/master/dist/${file}`;
  body += `##### ${file}${desc}
\`\`\`curl
curl -o ${file} ${rawUrl}
\`\`\`

`;
}

body += `#### Step2. 貼到Nginx設定檔
Nginx設定檔基本範例：

\`\`\`
server {
    listen 80;
    # server_name localhost;

    location / {
        root /var/www/html;
        index index.html;
        error_page 404 /404.html;
    }
}
\`\`\`
`;

await fs.writeFile(path.join(process.cwd(), 'release_notes.md'), body, 'utf-8');
console.log('[release-notes] Generated release_notes.md successfully.');
