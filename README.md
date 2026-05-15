# X Media Downloader

一个最小可用的 Chrome Manifest V3 插件，用于在 x.com / twitter.com 推文顶部操作区插入单个媒体下载按钮。

实现思路：
- content script 负责观察页面、识别推文、插入按钮
- 注入 page-hook 拦截页面自身 GraphQL/XHR 响应，提取 tweet 媒体数据
- background service worker 统一调用 downloads API 发起下载

目录：
- manifest.json
- background/service-worker.js
- content/shared.js
- content/dom-utils.js
- content/media-extractor.js
- content/inject.js
- content/content.js
- content/styles.css
- tests/*.test.js

安装：
1. 打开 Chrome -> 扩展程序 -> 管理扩展程序
2. 打开“开发者模式”
3. 选择“加载已解压的扩展程序”
4. Select the project folder that contains this extension's manifest.json file (for example, the cloned x-media-downloader repository directory).

使用：
1. 打开任意 x.com 或 twitter.com 推文详情页或时间线
2. 等页面加载后，推文顶部右侧操作区会出现单个下载按钮
3. 点击一次会下载当前推文的全部可用媒体（图片 + 视频）
4. 文件名会优先基于推文正文生成短标题；若取不到正文，则回退到 author + tweetId 命名

测试：
- 在项目目录执行：npm test

当前限制：
- 视频下载优先选择最高码率 mp4；如果页面只提供 m3u8，本版本不会做转码
- X 页面结构经常变化，按钮挂载位置未来可能需要微调
- 某些受限媒体若页面未实际返回媒体元数据，按钮不会强行伪造下载

后续建议：
- 增加 popup/options，让用户可选 saveAs、文件名规则、画质偏好
- 增加 popup/options，让用户可切换“正文标题命名 / author+tweetId 命名”
- 增加对引用推文 / 转推媒体的单独区分
- 为按钮挂载增加更稳的 action bar 识别策略
