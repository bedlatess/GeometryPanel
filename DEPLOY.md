# 0.7.0 部署与发布

正式网页：https://bedlatess.github.io/GeometryPanel/
发布下载：https://github.com/bedlatess/GeometryPanel/releases/tag/v0.7.0

以 `web/` 为 Git 仓库根。仅 `dist/` 发布到 GitHub Pages。业务协议、原生系统能力与部署来源沿用原实现。原 APK、拆解材料、流量数据库、账号、签名私钥和参考界面图不进入仓库。

发布流程：在 `ui-v2` 完成 P0～P4；每步通过 `npm test`、`npm run build`、`npm run test:browser`。P4 运行 `node scripts/check-ui.mjs`、`node scripts/ui-contact-sheet.mjs`，生成合成数据对照图和检查证据。给发布前 `main` 提交打 `pre-0.7.0` 标签，再合并并推送 `main`。

网页工作流完成测试、构建、Chromium/WebKit 回归和 Pages 部署。网页上线后运行 `npm run android:build`，使用本机原稳定签名，完成单元测试、lint、APK 签名和对齐检查。macOS Actions 运行 `bash ios/scripts/build.sh`，执行模拟器测试并构建标准版、组件版两个 arm64 设备包。核对版本、来源提交与校验和后发布 GitHub Release `v0.7.0`。

安装包加载正式网页，新图标需要安装新包。iOS 包保持未签名，使用者自签；组件版需要相应 App Groups 支持。iPhone 添加到主屏幕后的新图标和启动画面由真实设备集中验收。

发布证据与完整截图放在工作区 `../docs/audit/交付包/`。用户只按 [ACCEPTANCE.md](ACCEPTANCE.md) 的 B、C 两组统一验收。自动测试只使用合成数据，不代表真实 Safari、账号、短信、车辆或安装验收。
