# 0.9.0 审计与发布

当前开发分支 `ui-v3`，回滚基点 `pre-0.9.0`。**Claude 最终审计通过前，不合并 main，不部署正式网页，不发布正式安装包或 Release。** main 推送会自动部署。

审计包放在工作区 `docs/audit/0.9.0/`，包括完整合成检查、18 图对应的双主题实际截图、候审视觉基准、连续交互录屏、功能对照及真机清单。候审视觉基准在 Claude 批准后才提交，不把设计参考图放进本仓库。

审计通过后的顺序：

1. 核对 ui-v3 审计提交与回滚标签。将获批的候审视觉基准复制到仓库 `tests/visual-baselines/`，把 playwright.config.ts 的 snapshotPathTemplate 同步改为该仓库路径，重跑三项检查并提交。基准仍为实际合成截图，不能把设计参考图复制进仓库。完成后再合并 main。
2. 等待 Pages 工作流测试、构建、浏览器回归及部署完成，验证正式域名和版本。
3. 用原稳定签名重新构建 Android APK，执行签名和对齐检查。
4. macOS Actions 构建标准版、widget 版两个未签名 IPA；核对版本、来源提交、SHA-256。
5. 按既有 Release 模板发布 v0.9.0，附三个安装包及实机验收清单，再由用户集中实测。

审批前 snapshotPathTemplate 指向工作区候审目录；因此尚未在只有 web 仓库的远端跑完整视觉回归。正式 CI 的前置条件是上一步批准并提交基准，本地检查不跳过视觉比较。

本轮视觉基准来自 Windows、Chrome 156（本机 executable override）和 Playwright WebKit 27.2。
Linux CI 采用其固定浏览器构建时，应先复现并由 Claude 复核平台差异，不能自动覆盖为通过。

本轮 macOS CI 已验证 haptic 桥接编译，普通版和 widget 版均成功；这是编译验证产物，正式发布仍要等待最终审计。网页及容器测试只用合成数据，不发送真实短信、登录、车控或蓝牙请求。

# 0.8.0 历史发布流程

正式网页：https://bedlatess.github.io/GeometryPanel/
发布下载：https://github.com/bedlatess/GeometryPanel/releases/tag/v0.8.0

以 `web/` 为 Git 仓库根。仅 `dist/` 发布到 GitHub Pages。业务协议、原生系统能力与部署来源沿用原实现。原 APK、拆解材料、流量数据库、账号、签名私钥和参考界面图不进入仓库。

发布流程：在 `release-0.8.0` 依次完成修改单 1、修改单 2；发布前通过 `npm test`、`npm run build`、`npm run test:browser`。P4 运行 `node scripts/check-ui.mjs`、`node scripts/ui-contact-sheet.mjs`，生成合成数据对照图和检查证据。给发布前 `main` 提交打 `pre-0.8.0` 标签，再合并并推送 `main`。

网页工作流完成测试、构建、Chromium/WebKit 回归和 Pages 部署。网页上线后运行 `./scripts/build-android.ps1`，使用本机原稳定签名，完成单元测试、lint、APK 签名和对齐检查。macOS Actions 运行 `bash ios/scripts/build.sh`，执行模拟器测试并构建标准版、组件版两个 arm64 设备包。核对版本、来源提交与校验和后发布 GitHub Release `v0.8.0`。

安装包加载正式网页，新图标需要安装新包。iOS 包保持未签名，使用者自签；组件版需要相应 App Groups 支持。iPhone 添加到主屏幕后的新图标和启动画面由真实设备集中验收。

发布证据与完整截图放在工作区 `../docs/audit/交付包/`。用户只按 工作区 `docs/ACCEPTANCE.md` 的 B、C 两组统一验收。自动测试只使用合成数据，不代表真实 Safari、账号、短信、车辆或安装验收。
