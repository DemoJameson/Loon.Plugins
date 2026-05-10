# Proxy.Modules 项目概览

个人代理模块与 Trakt 简体中文增强后端组合项目。主要面向 Loon、Surge、Quantumult X 和 Vercel。

主要目录：
- `trakt_simplified_chinese/`：Trakt 简体中文代理模块，含源码、图片、构建产物和平台配置。
- `trakt_simplified_chinese/src/`：ESM 源码入口，包括 `main.mjs`、`main-clear-cache.mjs`、`main-expand-cache.mjs`；请求/响应分派在 `request.mjs`、`response.mjs`。
- `trakt_simplified_chinese/src/features/`：翻译、人物、评论、播放源注入等行为模块。
- `trakt_simplified_chinese/src/outbound/`：外部 Trakt、TMDb、Sofa Time、Google Translate、Vercel 后端客户端。
- `trakt_simplified_chinese/src/shared/`：路由、媒体类型、翻译缓存、简繁转换、翻译流水线等跨入口逻辑。
- `api/`：Vercel Serverless Functions 后端，核心在 `api/trakt/`，含翻译缓存、修订和管理接口。
- `public/`：Vercel 静态页面和素材。
- `scripts/`：构建与测试驱动，`scripts/vendor/Env.*` 为代理运行时适配。
- `tests/`：Node 内置测试、fixture 和 helper。
- `fix_infuse_image_language/`、`github_redirect_to_local/`：独立代理模块。