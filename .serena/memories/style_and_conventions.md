# 编码风格与约定

- 回答用户必须使用中文；代码审查发现也使用中文。
- 项目使用 ESM，源码以 `.mjs` 为主，Vercel 函数以 `.js` 为主。
- 格式化由 Biome/Prettier 风格接管，缩进 4 空格。
- 文件名以 kebab-case 为主，如 `google-translate-client.mjs`、`translation-cache.js`。
- 测试文件使用 `*.test.mjs`。
- 新增 Trakt 脚本行为优先放 `trakt_simplified_chinese/src/features/`；外部 API 调用放 `outbound/`；跨功能逻辑放 `shared/`；纯工具放 `utils/`。
- 后端接口改动集中在 `api/trakt/`，管理页相关静态资源集中在 `public/admin.html`。
- 不要引入 Next.js、Hono 或额外服务框架，除非任务明确要求迁移架构。
- 修改 Trakt 源码、模块参数、资源链接或 Env 适配时，通常需要运行 `npm run build:trakt` 更新构建产物。