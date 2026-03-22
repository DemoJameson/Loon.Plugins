# Loon.Plugins

个人使用的 Loon 插件仓库，主要收录一些影视相关插件。

## 插件列表

| 插件 | 说明 | 导入 Loon |
| --- | --- | --- |
| [Trakt Simplified Chinese][trakt-plugin] | 优先补全和显示 Trakt 的简体中文标题、简介等内容 | [导入][trakt-import] |
| [Fix Infuse Image Language][infuse-plugin] | 调整 TMDB 图片语言排序，改善 Infuse 图片语言匹配 | [导入][infuse-import] |

## 使用方式

在 Loon 中添加对应订阅链接，或点击“导入”。

启用前请确认：

- 已开启插件
- 已正确配置 `MITM`

## 目录结构

```text
├─ README.md
├─ fix_infuse_image_language
│  ├─ fix_infuse_image_language.js
│  └─ fix_infuse_image_language.plugin
└─ trakt_simplified_chinese
   ├─ trakt_simplified_chinese.js
   └─ trakt_simplified_chinese.plugin
```

## 说明

- 当前配置以 Loon 为目标客户端
- 结果依赖上游接口返回内容
- 上游未提供对应内容时，插件不会额外生成数据

[trakt-plugin]: https://raw.githubusercontent.com/DemoJameson/Loon.Plugins/main/trakt_simplified_chinese/trakt_simplified_chinese.plugin
[infuse-plugin]: https://raw.githubusercontent.com/DemoJameson/Loon.Plugins/main/fix_infuse_image_language/fix_infuse_image_language.plugin
[trakt-import]: https://gocy.pages.dev/#loon://import?plugin=https://raw.githubusercontent.com/DemoJameson/Loon.Plugins/main/trakt_simplified_chinese/trakt_simplified_chinese.plugin
[infuse-import]: https://gocy.pages.dev/#loon://import?plugin=https://raw.githubusercontent.com/DemoJameson/Loon.Plugins/main/fix_infuse_image_language/fix_infuse_image_language.plugin
