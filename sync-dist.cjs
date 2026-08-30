// 前端构建产物同步到 worker public（增量复制，保留旧资源文件）
// 重要：不清空 assets —— SSR 缓存（300s）/浏览器/SW 缓存的旧 HTML 仍会引用上一轮
// 的 hash 资源文件，删除它们会导致 "Failed to load module script: MIME type text/html"。
// 旧文件按需定期人工清理（确认无旧缓存引用后）。
const fs = require('fs');
const path = require('path');

const src = 'E:/dsh_work/zhuge-frontend/dist';
const dst = 'E:/dsh_work/zhuge-worker/public';

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name);
    const d = path.join(to, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else if (!fs.existsSync(d) || fs.readFileSync(s).equals(fs.readFileSync(d))) {
      // 目标不存在或内容一致时才写（避免无谓 IO）
      if (!fs.existsSync(d)) fs.copyFileSync(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

copyDir(src, dst);
const assets = fs.readdirSync(path.join(dst, 'assets'));
const indexHtml = fs.readFileSync(path.join(dst, 'index.html'), 'utf8');
const refs = [...indexHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
console.log('synced (incremental). assets total:', assets.length);
console.log('current HTML refs:', refs.length);
for (const r of refs) {
  const f = path.join(dst, r.replace(/^\//, ''));
  if (!fs.existsSync(f)) console.log('  MISSING REF:', r);
}
console.log('SSR placeholder:', indexHtml.includes('SSR_INIT_DATA'));
