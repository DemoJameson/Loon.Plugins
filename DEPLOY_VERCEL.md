# Vercel 代理与缓存后端

这个仓库包含可直接部署到 Vercel 的后端接口，用于为脚本和插件提供可靠的缓存储存与代理。

目前已包含以下模块：
- **Trakt 批量翻译缓存**：`api/trakt/translations.js` -> 路径：`/api/trakt/translations`
- **TiDB 章节缓存**：`api/tidb/media.js` -> 路径：`/api/tidb/media`

## 缓存与存储配置

Vercel 部署完成后，需在项目中添加一个 KV 存储（由 Upstash Redis 提供支持），并在环境变量中确保配置了以下凭证（Vercel 通常会自动注入）：
- `KV_REST_API_URL` + `KV_REST_API_TOKEN`
- 或 `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`

---

## 模块一：Trakt 批量翻译缓存

- 路径：`/api/trakt/translations`
- 方法：`GET`（查询缓存）、`POST`（写入缓存）

### 接口约定

#### GET `/api/trakt/translations`

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

#### POST `/api/trakt/translations`

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

### 缓存设计

- 插件流程：先查询缓存 -> 缺失部分请求 Trakt 官网 -> 将新结果批量异步写回。
- KV Key 格式：`trakt:translation:shows:{id}` 或 `trakt:translation:movies:{id}`。
- 有效翻译（含标题或简介）缓存 90 天；未找到或无效翻译缓存 7 天。

---

## 模块二：TiDB 章节标记缓存

为 TiDB into Emby 脚本提供剧集 Intro/Outro 等章节标记的缓存支持，避免高强度请求穿透回源站。

- 路径：`/api/tidb/media`
- 方法：`GET`（查询缓存）、`POST`（写入缓存）

### 接口约定

#### GET `/api/tidb/media`

查询参数：
- `tmdb_id=12345`
- `season=1`

返回示例：

```json
{
  "1": {
    "intro": { "start": 0, "end": 100 }
  },
  "2": {}
}
```

#### POST `/api/tidb/media`

请求体示例：

```json
{
  "tmdb_id": "12345",
  "season": "1",
  "episodes": [
    {
      "episode": 1,
      "has_data": true,
      "data": { "intro": { "start": 0, "end": 100 } }
    },
    {
      "episode": 2,
      "has_data": false,
      "data": {}
    }
  ]
}
```

### 缓存设计

- 采用 Redis Hash 结构：`tidb:show:{tmdb_id}:{season}`存储单季所有集。
- 采用双层过期机制：Hash 整体过期时间为 30 天，但在 Value 内部封装了 `expireAt` 防止单个字段无法设置独立过期的问题。
- 有效章节数据 (`has_data: true`) 的单个部分有效 30 天，无数据或提取失败的记录仅缓存 30 分钟。

---

## 部署到 Vercel

1. 把当前仓库推到 GitHub。
2. 在 Vercel 中导入这个仓库。
3. 关闭 Project Settings的`Deployment Protection` - `Vercel Authentication`。
4. 在 Vercel 项目里添加 Storage (Redis / KV)，关联刚创建的项目。
5. 部署完成后，记下你的分配域名，比如 `https://your-project.vercel.app`。

### 使用 dev 分支部署

#### 方式一：`dev` 作为 Preview 分支 (推荐验证用)

1. 把改动推送到 `dev` 分支，维持 `main` 为生产分支不变。
2. 拿每次 Vercel 生成的 Preview 域名单独测试。

#### 方式二：把 `dev` 设为 Production Branch

1. 打开 Vercel 项目 `Settings -> Git`。
2. 把 `Production Branch` 改成 `dev`。
3. 当使用本地 CLI 部署时可执行：`vercel --prod`。

---

## 在脚本调用处接入

### Trakt 插件
导入 `trakt_simplified_chinese.plugin` 后，给参数 `批量翻译后端` 填入你的 Vercel 域名：`https://your-project.vercel.app`。后端若不可用则会自动退回到直接请求模式。

### TiDB Into Emby 脚本
在所需配置处（例如参数面板），填入部署后的代理加速 API 域名以供读取和写入。
