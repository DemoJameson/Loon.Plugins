# Loon Plugins

一个用于存放个人 Loon 插件的仓库，当前主要提供 Trakt 中文化相关插件。

## 项目说明

这个仓库的目标很直接：

- 为常用服务补充适合 Loon 的插件配置
- 通过脚本增强 App / 接口返回内容
- 尽量把安装方式保持为可直接订阅的 GitHub Raw 链接

当前仓库内已提供的插件数量不多，后续会继续按实际使用需求补充。

## 插件列表

| 插件 | 目录 | 说明 |
| --- | --- | --- |
| Trakt Simplified Chinese | `trakt_simplified_chinese/` | 优先展示简体中文翻译，并为部分 Trakt 列表接口补充中文标题与简介 |

## Trakt Simplified Chinese

`trakt_simplified_chinese` 用于改善 Trakt 在中文场景下的显示体验。

### 功能特性

- 对部分剧集 / 电影列表接口补充简体中文标题、简介、标语
- 对已获取到的翻译结果进行本地缓存，减少重复请求
- 在接口返回 `zh` 多地区翻译时，优先取中国大陆简体中文结果

### 当前已处理接口

- `translations/zh`
- `sync/progress/up_next_nitro`
- `sync/playback/movies`
- `media/trending`
- `media/recommendations`
- `media/anticipated`
- `media/popular/next`
- `users/me/watchlist`
- `users/me/watchlist/shows`
- `users/me/watchlist/movies`
- `users/me/watchlist/shows/released/desc`
- `users/me/watchlist/movies/released/desc`
- `calendars/my/shows/{date}/{days}`
- `calendars/my/movies/{date}/{days}`
- `users/me/history`
- `users/me/history/episodes`
- `users/me/history/movies`
- `users/me/following/activities`
- `users/{username}/lists/{list_id}/items`
- `users/{username}/favorites`

### 工作方式

插件会拦截 `apiz.trakt.tv` 的部分响应内容，并在 Loon 中通过脚本：

1. 识别剧集或电影的 Trakt ID
2. 拉取对应的 `translations/zh` 数据
3. 优先选择 `zh-CN`
4. 将中文标题、简介、标语回填到原始响应
5. 使用本地缓存降低后续重复请求成本

## 安装

在 Loon 中添加以下插件链接：

```text
https://raw.githubusercontent.com/DemoJameson/Loon.Plugins/main/trakt_simplified_chinese/trakt_simplified_chinese.plugin
```

启用后请确认：

- 插件已在 Loon 中打开
- `MITM` 已生效
- 目标主机 `apiz.trakt.tv` 已被正确包含

## 仓库结构

```text
.
├── README.md
└── trakt_simplified_chinese
    ├── trakt_simplified_chinese.js
    └── trakt_simplified_chinese.plugin
```

## 兼容性与注意事项

- 当前配置面向 Loon 编写，未针对其他客户端做兼容保证
- 脚本依赖 GitHub Raw 地址分发，若网络环境受限可能影响更新
- 翻译内容来源于 Trakt 接口返回，不额外维护独立词库
- 当 Trakt 没有提供对应中文翻译时，插件不会强行生成内容
