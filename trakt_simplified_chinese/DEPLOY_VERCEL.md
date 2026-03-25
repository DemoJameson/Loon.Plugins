# Trakt Batch Translation Backend

这个仓库已经包含一个可直接部署到 Vercel 的后端接口：

- 路径：`/api/trakt/translations`
- 方法：
  - `GET`：只读取缓存
  - `POST`：只写入缓存
- 实现文件：`api/trakt/translations.js`

## 接口约定

### GET `/api/trakt/translations`

查询参数：

- `shows=1,2,3`
- `movies=11,12,13`

返回示例：

```json
{
  "shows": {
    "1": {
      "status": 1,
      "translation": {
        "title": "标题",
        "overview": "简介",
        "tagline": "标语"
      }
    }
  },
  "movies": {},
  "cache": {
    "kvEnabled": true,
    "mode": "read-through-client"
  }
}
```

### POST `/api/trakt/translations`

请求体示例：

```json
{
  "shows": {
    "1": {
      "status": 1,
      "translation": {
        "title": "标题",
        "overview": "简介",
        "tagline": "标语"
      }
    }
  },
  "movies": {}
}
```

## 部署到 Vercel

1. 把当前仓库推到 GitHub。
2. 在 Vercel 中导入这个仓库。
3. 关闭 Project Settings - Deployment Protection - Vercel Authentication
4. 在 Vercel 项目里添加一个 Redis/KV 存储，关联刚创建项目。
5. 确认项目环境变量里至少有以下一组：
   - `KV_REST_API_URL` + `KV_REST_API_TOKEN`
   - 或 `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
6. 部署完成后，记下你的域名，比如 `https://your-project.vercel.app`，填写到插件中。

## 使用 dev 分支部署

有两种常见方式：

### 方式一：`dev` 作为 Preview 分支

适合先验证功能，不影响正式环境。

1. 把改动推送到 `dev` 分支。
2. 在 Vercel 导入仓库后，保持生产分支还是 `main`。
3. 每次推送到 `dev`，Vercel 都会生成一个 Preview Deployment。
4. 你可以直接拿这个 Preview 域名填到 Loon 的 `批量翻译后端` 参数里测试。

### 方式二：把 `dev` 设为 Production Branch

适合你当前只想让 `dev` 承担正式部署。

1. 打开 Vercel 项目。
2. 进入 `Settings -> Git`。
3. 把 `Production Branch` 改成 `dev`。
4. 之后每次 push 到 `dev`，都会触发正式域名更新。

如果你想用 CLI：

```bash
vercel --prod
```

前提是当前本地仓库已经链接到对应的 Vercel 项目，并且项目生产分支已经设成 `dev`。

## 在 Loon 中接入

导入 `trakt_simplified_chinese.plugin` 后，给参数 `批量翻译后端` 填入你的 Vercel 域名，例如：

```text
https://your-project.vercel.app
```

脚本会优先调用：

```text
GET  https://your-project.vercel.app/api/trakt/translations
POST https://your-project.vercel.app/api/trakt/translations
```

如果后端不可用，脚本会自动退回到纯本地缓存 + 直接请求 Trakt 的模式。

## 缓存设计

- 后端只负责缓存，不会主动请求 Trakt。
- 插件流程是：
  1. 先向后端查询缓存
  2. 对未命中的条目，插件自己请求 Trakt `translations/zh`
  3. 插件再把结果批量写回后端
- 后端会把每个条目的结果单独写入 KV：
  - `trakt:translation:shows:{id}`
  - `trakt:translation:movies:{id}`
- 完整简中翻译缓存 90 天。
- 不完整翻译或无结果缓存 7 天。

## 设计说明

- 列表页避免了“对同一批条目重复逐个请求 Trakt”的问题。
- 不同列表组合仍然可以复用同一份后端缓存，因为缓存粒度是单个 `show/movie traktId`。
- 详情页也复用同一套缓存流程。
