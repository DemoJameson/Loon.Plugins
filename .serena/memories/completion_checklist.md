# 任务完成检查

- 按改动范围运行测试：窄改动可运行定向 `node --test tests/xxx.test.mjs`，Trakt 脚本源码改动至少运行 `npm run build:trakt` 和相关测试。
- 交付前通常运行 `npm run format:check`；大范围或 Trakt 核心改动运行 `npm run check:trakt` 或 `npm test`。
- 修改 Trakt 源码、模块参数、资源链接或 Env 适配时，确认构建产物 `trakt_simplified_chinese/*.js`、`*.plugin`、`*.sgmodule`、`*.snippet` 以及必要配置已同步。
- 不提交真实 token、client secret、后端密钥或 `.trakt-live-test.local.json`。
- PR/交付说明包含：变更目的、影响的代理模块或 Vercel 接口、是否更新生成产物、执行过的测试命令。