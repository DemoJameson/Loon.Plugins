# 常用命令

Windows PowerShell 下在仓库根目录执行：

- `npm run format`：格式化整个仓库。
- `npm run format:check`：检查格式，不写入文件。
- `npm run build:trakt`：构建 Trakt 发布产物和平台模块配置。
- `npm run sync:env.js`：同步代理运行时 Env 适配文件。
- `npm run check:trakt`：格式检查、构建 Trakt，并对源码、vendor、构建产物做 `node --check`。
- `npm test`：构建 Trakt 后运行默认离线测试。
- `npm run test:trakt:live`：运行真实 Trakt/Vercel 后端联调，需要本地凭据。
- `npm run test:trakt:all`：串行运行完整 Trakt 测试集合。
- `node --test tests/xxx.test.mjs`：定向跑单个测试；按项目约定先运行 `npm run format` 和 `npm run build:trakt`。
- `rg --files`：列文件。
- `rg "pattern"`：快速搜索文本。
- `git status --short`：查看工作区状态。