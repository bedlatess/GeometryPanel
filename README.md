# 几何面板

极核车友的第三方面板，基于原作者授权的旧APK与网页发布物恢复功能并重新实现。网页、Android与iOS共用一套界面和业务；原生工程负责系统能力。主工程为本目录，工作区的 `panel-android/` 仅保留早期参考。

[打开网页](https://bedlatess.github.io/GeometryPanel/) · [下载APK / unsigned IPA](https://github.com/bedlatess/GeometryPanel/releases/tag/v0.5.0) · [集中验收](ACCEPTANCE.md) · [原版功能逐项对照](verification/original-parity.md)

当前 **0.5.0**，功能补齐版，整体UI后续统一优化。iPhone可在Safari分享菜单中“添加到主屏幕”。IPA不签名，使用者自签；不会签名继续使用网页。Android使用本项目稳定证书，可覆盖本项目旧版升级。

## 功能与平台

| 功能 | Safari / 主屏幕 | Android APK | iOS IPA |
|---|---|---|---|
| 登录、多账号、多车、云车况及确认后车控 | 支持 | 共用网页 | 共用网页 |
| 地图、骑行统计/轨迹、胎压、消息、车型设置 | 支持 | 共用网页 | 共用网页 |
| 签到、积分、可选社区任务 | 前台执行 | 系统任务调度 | 前台和系统机会调度 |
| 充电/电池历史、时段筛选、CSV/图片导出 | 打开期间记录 | 后台读取并记录 | 系统允许时读取并记录 |
| 后台云监控、8类提醒 | 关闭后不可用 | 前台服务及系统后备任务 | BGAppRefresh，无法保证频率 |
| BLE1认证/遥测、2.0手机钥匙登记/查询 | 需安装包 | 恢复旧版协议 | 恢复旧版协议，扫描选车 |
| 组件和快捷入口 | 添加到主屏幕 | 四种尺寸和车控入口 | 可选WidgetKit版/系统意图，多个组件共用配置 |
| 壁纸、投屏、Gemini OTA、扫码和诊断 | 需安装包 | 原生流程 | 原生流程，手动连接车辆热点 |
| 官方应用连接账号、保活模块、APK验签升级 | 不适用 | 可选原生流程 | 短信登录及自签安装替代 |

车控、社区写入和仪表传输有明确确认，结果不明不自动重发。任务所有动作默认关闭；发帖文字与清理另行确认，只有本次新帖作者、正文、时间和唯一标识吻合时才清理。旧点赞接口可能切换已有赞，需独立确认。

历史是本机实际观测，无法补回未读取的时段。缺失值不填0，缺测不当作充满，过时/未来报告单独处理。续航只取车辆主页，不被电池接口占位值覆盖。轨迹底图仅主动点击后向高德提供坐标，演示数据不外发。

原版117个应用桥入口按20组逐项归类，见 [对照表](verification/original-parity.md) 和 [机器可读清单](verification/original-parity.json)。统一RPC和类型化API替代原begin/poll流程。映射完成不等于所有车型已经实测。

原版本身没有完成成熟自动靠近解锁、BLE2/3钥匙配对、投屏音频/反控、最大限速写入和复杂多键，保留证据说明。OTA仅恢复AE5I 5寸Sunplus Gemini流程，不附固件；传输ACK不代表刷写成功。

## 本机数据与更新

网页账号、车辆和历史用WebCrypto AES-GCM与不可导出的CryptoKey存于IndexedDB，按网站路径隔离。旧单会话自动迁移为多账号，随机本机ID保持稳定；写操作串行，支持时使用跨标签锁。浏览器加密不能隔离同源恶意脚本，需保护部署来源。

只有主动启用原生后台、任务或桌面控制时，必要凭据才交接本机加密库。Android用Keystore，iOS用Keychain/加密文件，不上传本项目服务器。账号/车随机ID和epoch绑定后台与快捷入口；凭据变更、移除或退出使旧作用域失效。全部退出撤销原生绑定并清本机加密记录，不调用影响其它设备的全局退出接口。

离线只缓存静态页面、脚本、样式和图标，不缓存验证码、账号或车辆API。新版本准备后空闲时显式切换，失败保留旧页面。设置可查看/清理旧页面缓存，保留账号和历史。Android原生另有固定正式来源网页快照及回退，不把原作者镜像当作受信页面。

## 目录与开发

| 路径 | 职责 |
|---|---|
| `src/api/` | 官方接口、签名、登录、车控、扩展与任务 |
| `src/core/` | 车况、多账号/加密存储、历史、任务及原生RPC |
| `src/ui/`、`src/main.ts`、`src/styles.css` | 各功能面板、页面编排及基础样式 |
| `android/`、`ios/` | 系统能力、测试和安装包工程 |
| `tests/`、`verification/` | 模拟回归、恢复协议、对照和验证记录 |
| `scripts/`、`.github/workflows/` | 离线生成、构建、验证与部署 |

```powershell
npm ci
npm test
npm run build
npx playwright install chromium webkit
npm run test:browser
```

Node.js24。Windows可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定Chrome。`npm run verify`执行单测、构建与浏览器回归；全部合成数据并拦截外发，不发送真实短信、社区操作或车辆命令，不等于真实Safari或实车验收。

`dist/`部署到HTTPS静态站点。跨域和安装渠道按实际部署验证，不开放任意URL代理、不关闭浏览器安全策略。仅本工程源码发布，原APK、拆解材料、抓包库、凭据和签名私钥不进仓库。

Android运行 `npm run android:build`，需要JDK21和SDK36。iOS由macOS Actions运行 `bash ios/scripts/build.sh`，测试模拟器后构建两个arm64设备包，IPA保持未签名。见 [部署](DEPLOY.md)、[Android](android/README.md)、[iOS](ios/README.md)、[共用RPC](verification/native-contract.md) 和 [新增合同](verification/parity-bridge-v2.md)。
