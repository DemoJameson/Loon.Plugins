# Trakt Translation Backend

仓库里已经包含一个可直接部署到 Vercel 的后端接口：

- 路径：`/api/trakt/translations`
- 方法：
  - `GET`：读取缓存
  - `POST`：写入缓存
- 实现文件：`/api/trakt/translations.js`

## 接口说明

### GET `/api/trakt/translations`

查询参数支持：
- `shows=1,2,3`
- `movies=11,12,13`
- `episodes=198225:1:1,198225:1:2,198225:1:3`

至少需要提供一类参数，否则会返回 `400`。

如果服务端未配置 KV，接口会返回 `500`：

```json
{
  "error": "KV is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
}
```

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
  "episodes": {
    "198225:1:1": {
      "status": 2,
      "translation": {
        "title": "示例标题",
        "overview": null,
        "tagline": null
      }
    }
  }
}
```

说明：
- `status = 1` 表示 `FOUND`
- `status = 2` 表示 `PARTIAL_FOUND`
  - 条件是任意中文地区语言的 `title` 字段有值，但未达到完整命中
- `status = 3` 表示 `NOT_FOUND`
- 后端只返回缓存内容，不会主动请求 Trakt

### POST `/api/trakt/translations`

如果服务端未配置 KV，接口同样会返回 `500` 和上面的错误信息。

请求体支持：

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
  "episodes": {
    "198225:1:1": {
      "status": 2,
      "translation": {
        "title": "示例标题",
        "overview": null,
        "tagline": null
      }
    }
  }
}
```

返回示例：

```json
{
  "counts": {
    "shows": 1,
    "movies": 0,
    "episodes": 1
  }
}
```

## 部署到 Vercel

1. 将当前仓库推送到 GitHub。
2. 在 Vercel 中导入这个仓库。
3. 关闭 `Project Settings -> Deployment Protection -> Vercel Authentication`。
4. 给项目关联一个 Redis / KV 存储。
5. 确认环境变量至少配置以下任意一组：
   - `KV_REST_API_URL` 和 `KV_REST_API_TOKEN`
   - `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`
6. 部署完成后，记录你的域名，例如 `https://your-project.vercel.app`。

## 在 Loon 中使用

将插件参数里的后端地址填写为你的 Vercel 域名，例如：

```text
https://your-project.vercel.app
```

脚本会调用：

```text
GET  https://your-project.vercel.app/api/trakt/translations
POST https://your-project.vercel.app/api/trakt/translations
```

如果后端不可用，脚本会继续使用本地缓存，并在需要时直接请求 Trakt。

## 缓存设计

- 后端只负责缓存，不主动拉取 Trakt 翻译
- 插件流程：
  1. 先向后端批量读取缓存
  2. 对未命中的条目，由插件直接请求 Trakt `translations/zh`
  3. 再将结果批量写回后端
- 后端按单条记录写入 KV，key 格式为：
  - `trakt:translation:shows:{id}`
  - `trakt:translation:movies:{id}`
  - `trakt:translation:episodes:{showId}:{seasonNumber}:{episodeNumber}`
- `FOUND` 永不过期
- `PARTIAL_FOUND` 缓存 30 天
- `NOT_FOUND` 缓存 7 天

## 说明

- 现在后端同时支持 `show`、`movie` 和 `episode`
- `episode` 缓存按 `showId:seasonNumber:episodeNumber` 存储
- 详情页和列表页可以复用同一套后端缓存
