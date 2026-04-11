# Loon.Plugins

个人使用的代理工具脚本仓库，主要收录一些影视相关插件。

Github Pages 页面：

- 插件列表首页：<https://demojameson.github.io/Loon.Plugins/>

## 插件列表

| 插件 | 说明 | Loon | Surge | Quantumult X |
| --- | --- | --- | --- | --- |
| Trakt Simplified Chinese | 优先补全和显示 Trakt 的简体中文标题、简介等内容 | [`.plugin`][trakt-plugin] | [`.sgmodule`][trakt-sgmodule] | [`.snippet`][trakt-snippet] |
| Fix Infuse Image Language | 调整 TMDB 图片语言排序，改善 Infuse 图片语言匹配 | [`.plugin`][infuse-plugin] | 暂无 | 暂无 |

## 使用方式

按所用客户端添加对应订阅链接。

启用前请确认：

- 已开启插件
- 已正确配置 `MITM`

Trakt Simplified Chinese 当前发布格式：

- Loon：`.plugin`
- Surge：`.sgmodule`
- Quantumult X：`.snippet`

## 目录结构

```text
├─ README.md
├─ fix_infuse_image_language
│  ├─ fix_infuse_image_language.js
│  └─ fix_infuse_image_language.plugin
└─ trakt_simplified_chinese
   ├─ trakt_simplified_chinese.js
   ├─ trakt_simplified_chinese.plugin
   ├─ trakt_simplified_chinese.sgmodule
   └─ trakt_simplified_chinese.snippet
```

## 说明

- `Trakt Simplified Chinese` 当前已提供 `Loon / Surge / Quantumult X` 三种发布文件
- `Fix Infuse Image Language` 当前仅提供 Loon 配置
- 结果依赖上游接口返回内容
- 上游未提供对应内容时，插件不会额外生成数据

[trakt-plugin]: https://raw.githubusercontent.com/DemoJameson/Loon.Plugins/main/trakt_simplified_chinese/trakt_simplified_chinese.plugin
[trakt-sgmodule]: https://raw.githubusercontent.com/DemoJameson/Loon.Plugins/main/trakt_simplified_chinese/trakt_simplified_chinese.sgmodule
[trakt-snippet]: https://raw.githubusercontent.com/DemoJameson/Loon.Plugins/main/trakt_simplified_chinese/trakt_simplified_chinese.snippet
[infuse-plugin]: https://raw.githubusercontent.com/DemoJameson/Loon.Plugins/main/fix_infuse_image_language/fix_infuse_image_language.plugin
