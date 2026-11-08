# 0.9.0 已批准视觉基准

Claude 最终审计通过了 `c40fae1` 与修正提交 `9ef12cd`，用户明确批准重新生成本批基准并提交。

所有图片均由 `tests/checkpoint.spec.ts` 使用合成账号和车辆生成。没有使用设计参考图或真实账号、车辆数据。每个平台共 364 张，覆盖 Chromium / WebKit、深浅两种主题及页面状态。

- `win32/`：Windows 发布机，Playwright 1.65.0 内置 Chromium 158.0.8127.18、WebKit 27.2。
- `linux/`：Ubuntu 24.04 Actions，同一锁文件和内置浏览器，生成来源和 run 记录于工作区审计包。
- 浏览器和 Node 时区均固定为 `Asia/Shanghai`。

普通 `npm run verify` 和 Pages 工作流只比较已提交的基准。此次生成授权只适用于获批的 0.9.0 批次，后续视觉变更仍须审核后更新，不能以更新截图代替排查失败。
