# 原版功能逐项对照（0.9.0 UI 迁移复核）

按授权原版的117个应用桥入口逐项归类，另2个Bugly SDK方法不计。新实现用统一RPC和类型化API替代原来的begin/poll，因此不要求新旧方法名相同。此表记录实现位置与平台替代，不代表所有车辆或设备已实测通过。

网页独有的登录/滑块/短信、云端车况和控制、地图导航、骑行轨迹/统计、胎压、消息已读/清除、30项车型设置以及使用偏好，分别见 `recovered-horn-contract.json`、`recovered-controls-contract.json`、`extensions-contract.json` 和 `tasks-protocol.md`。

| 功能组 | 对应旧入口数 | 当前实现 | Safari | Android | iOS IPA |
|---|---:|---|---|---|---|
| 扫描 | 2 | tools.open scanner；打开、取消与权限由原生页面管理 | 需安装包 | 已实现，待实机验收 | 已实现，待实机验收 |
| 云端请求事务 | 2 | 固定官方服务的类型化 API，AbortSignal 和单次请求结果替代 begin/poll | 已实现 | 已实现，待实机验收 | 已实现，待实机验收 |
| 投屏 | 8 | meter.open 内的完整配对、采集授权、启动/停止/状态/诊断页面 | 需安装包 | 已实现，待实机验收 | 本应用画面采集与手动连接车辆热点 |
| 本机存储 | 8 | AES-GCM IndexedDB原子记录、写队列及跨标签锁，迁移旧会话 | 已实现 | 已实现，待实机验收 | 已实现，待实机验收 |
| 账号作用域 | 4 | 多账号/多车随机ID和epoch，显式授权后accounts.sync/remove | 已实现 | 已实现，待实机验收 | 已实现，待实机验收 |
| 主题与安全区 | 5 | 网页主题偏好、CSS安全区及共用原生主题 | 共享界面重构完成，待实机验收 | 共享界面重构完成，待实机验收 | 共享界面重构完成，待实机验收 |
| 后台监控 | 4 | background.configure/status/run；8类提醒和系统调度 | 仅打开期间记录 | 已实现，待实机验收 | 前台及BGAppRefresh机会刷新 |
| 电池与充电历史 | 10 | background.history/history.clear；时段、起止筛选、变化曲线、统计和CSV | 已实现 | 已实现，待实机验收 | 已实现，待实机验收 |
| 签到与社区任务 | 6 | 签到/积分/连签奖励及多账号任务；网页前台与原生调度共用合同 | 已实现 | 已实现，待实机验收 | 任务可用；定时受系统机会调度 |
| 分类提醒与日志 | 5 | 8类开关、系统通知权限、事件历史和分类清除 | 需原生通知；可查看本机读数历史 | 已实现，待实机验收 | 已实现，待实机验收 |
| 桌面组件与快捷入口 | 12 | 4种组件尺寸、车辆/控制绑定、摘要预览、默认配置与系统添加；快捷指令单独配置 | Safari添加到主屏幕 | 已实现，待实机验收 | 可选WidgetKit组件、AppIntents/深链、前台确认 |
| 官方登录连接 | 9 | 用户手动开启的限定官方应用VPN；固定H5代理、本机加密与确认后的单次网页交接 | 短信登录替代 | 已实现，待实机验收 | 短信登录替代；不提供官方应用VPN捕获 |
| 诊断与应用日志 | 5 | 系统保存/分享脱敏诊断和功能状态；命令/任务/提醒摘要 | 命令/任务摘要可用 | 已实现，待实机验收 | 已实现，待实机验收 |
| 安装包更新 | 9 | 版本显示、固定本仓库Release更新，Android验签安装、iOS下载并重新自签 | 网页更新或公开下载 | 已实现，待实机验收 | 检查版本并打开自签安装说明 |
| 页面缓存与更新 | 16 | 固定本项目正式来源；静态缓存、状态/清理、更新准备与显式切换；原生快照失败回退 | ServiceWorker静态离线和显式更新 | 已实现，待实机验收 | 固定网站WKWebView/系统网页缓存 |
| 车况图片导出 | 3 | Canvas绘制白名单车况；浏览器下载或原生asset.export panel | 已实现 | 已实现，待实机验收 | 已实现，待实机验收 |
| Android保活模块 | 4 | 针对本包名导出Magisk/KernelSU模块，不自动安装 | 不适用 | 已实现，待实机验收 | 不适用 |
| 蓝牙钥匙 | 2 | 准备车主资料、BLE1认证/遥测、2.0登记/查询、短时连接提醒 | 需安装包 | 已实现，待实机验收 | 已实现，待实机验收 |
| 仪表工具 | 2 | Gemini OTA、本地ZIP/两张图片/官方ZIP、预览和确认后传输 | 需安装包 | 已实现，待实机验收 | 手动连接车辆热点；协议端口和本机文件校验 |
| 平台设置 | 1 | 按需系统权限与设置引导 | 浏览器安装/权限说明 | 已实现，待实机验收 | 已实现，待实机验收 |

## 117项入口明细

| 原方法 | 原静态位置 | 新归类 | 实现文件 |
|---|---|---|---|
| `beginCameraScan` | `defpackage/x8.java:15` | 扫描 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeToolActivity.java`<br>`ios/Sources/NativeTools.swift` |
| `cancelCameraScan` | `defpackage/x8.java:41` | 扫描 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeToolActivity.java`<br>`ios/Sources/NativeTools.swift` |
| `beginRequest` | `defpackage/yc.java:99` | 云端请求事务 | `src/api/client.ts`<br>`src/api/sign.ts`<br>`src/api/zeeho.ts`<br>`src/api/tasks.ts` |
| `pollRequests` | `defpackage/yc.java:409` | 云端请求事务 | `src/api/client.ts`<br>`src/api/sign.ts`<br>`src/api/zeeho.ts`<br>`src/api/tasks.ts` |
| `available` | `io/github/lswlc33/zeehowebnext/cast/ZeehoCastBridge.java:350` | 投屏 | `src/stores/workflows/native.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/MeterActivity.java`<br>`ios/Sources/MeterCoordinator.swift` |
| `forgetProfile` | `io/github/lswlc33/zeehowebnext/cast/ZeehoCastBridge.java:375` | 投屏 | `src/stores/workflows/native.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/MeterActivity.java`<br>`ios/Sources/MeterCoordinator.swift` |
| `getDiagnostics` | `io/github/lswlc33/zeehowebnext/cast/ZeehoCastBridge.java:384` | 投屏 | `src/stores/workflows/native.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/MeterActivity.java`<br>`ios/Sources/MeterCoordinator.swift` |
| `getStatus` | `io/github/lswlc33/zeehowebnext/cast/ZeehoCastBridge.java:398` | 投屏 | `src/stores/workflows/native.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/MeterActivity.java`<br>`ios/Sources/MeterCoordinator.swift` |
| `pair` | `io/github/lswlc33/zeehowebnext/cast/ZeehoCastBridge.java:476` | 投屏 | `src/stores/workflows/native.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/MeterActivity.java`<br>`ios/Sources/MeterCoordinator.swift` |
| `requestProjection` | `io/github/lswlc33/zeehowebnext/cast/ZeehoCastBridge.java:529` | 投屏 | `src/stores/workflows/native.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/MeterActivity.java`<br>`ios/Sources/MeterCoordinator.swift` |
| `start` | `io/github/lswlc33/zeehowebnext/cast/ZeehoCastBridge.java:546` | 投屏 | `src/stores/workflows/native.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/MeterActivity.java`<br>`ios/Sources/MeterCoordinator.swift` |
| `stop` | `io/github/lswlc33/zeehowebnext/cast/ZeehoCastBridge.java:639` | 投屏 | `src/stores/workflows/native.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/MeterActivity.java`<br>`ios/Sources/MeterCoordinator.swift` |
| `appLogSession` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:464` | 诊断与应用日志 | `src/core/command-report.ts`<br>`src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeExports.java`<br>`ios/Sources/NativeTools.swift` |
| `appVersion` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:475` | 安装包更新 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeUpdates.java`<br>`ios/Sources/NativeTools.swift` |
| `applyPanelUpdate` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:486` | 页面缓存与更新 | `src/core/updates.ts`<br>`src/core/cache.ts`<br>`scripts/build-sw.mjs`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelCache.java` |
| `autoTask` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:492` | 签到与社区任务 | `src/api/tasks.ts`<br>`src/core/tasks-model.ts`<br>`src/stores/workflows/tasks.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeTasks.java`<br>`ios/Sources/NativeTasks.swift` |
| `autoTaskScope` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:512` | 签到与社区任务 | `src/api/tasks.ts`<br>`src/core/tasks-model.ts`<br>`src/stores/workflows/tasks.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeTasks.java`<br>`ios/Sources/NativeTasks.swift` |
| `background` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:530` | 后台监控 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/BackgroundMonitor.java`<br>`ios/Sources/NativeBackground.swift` |
| `backgroundStatus` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:537` | 后台监控 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/BackgroundMonitor.java`<br>`ios/Sources/NativeBackground.swift` |
| `batteryHistory` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:627` | 电池与充电历史 | `src/stores/workflows/background.ts`<br>`src/core/history.ts`<br>`src/core/history-store.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/BackgroundMonitor.java`<br>`ios/Sources/NativeHistory.swift` |
| `batterySpan` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:633` | 电池与充电历史 | `src/stores/workflows/background.ts`<br>`src/core/history.ts`<br>`src/core/history-store.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/BackgroundMonitor.java`<br>`ios/Sources/NativeHistory.swift` |
| `beginAppLog` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:639` | 诊断与应用日志 | `src/core/command-report.ts`<br>`src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeExports.java`<br>`ios/Sources/NativeTools.swift` |
| `beginAppUpdate` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:644` | 安装包更新 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeUpdates.java`<br>`ios/Sources/NativeTools.swift` |
| `beginBatteryHistory` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:650` | 电池与充电历史 | `src/stores/workflows/background.ts`<br>`src/core/history.ts`<br>`src/core/history-store.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/BackgroundMonitor.java`<br>`ios/Sources/NativeHistory.swift` |
| `beginBatterySpan` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:696` | 电池与充电历史 | `src/stores/workflows/background.ts`<br>`src/core/history.ts`<br>`src/core/history-store.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/BackgroundMonitor.java`<br>`ios/Sources/NativeHistory.swift` |
| `beginCacheManagement` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:760` | 页面缓存与更新 | `src/core/updates.ts`<br>`src/core/cache.ts`<br>`scripts/build-sw.mjs`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelCache.java` |
| `beginChargeHistory` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:901` | 电池与充电历史 | `src/stores/workflows/background.ts`<br>`src/core/history.ts`<br>`src/core/history-store.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/BackgroundMonitor.java`<br>`ios/Sources/NativeHistory.swift` |
| `beginClearChargeHistory` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:906` | 电池与充电历史 | `src/stores/workflows/background.ts`<br>`src/core/history.ts`<br>`src/core/history-store.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/BackgroundMonitor.java`<br>`ios/Sources/NativeHistory.swift` |
| `beginDiagStore` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:911` | 诊断与应用日志 | `src/core/command-report.ts`<br>`src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeExports.java`<br>`ios/Sources/NativeTools.swift` |
| `beginImageExport` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:992` | 车况图片导出 | `src/core/panel-export.ts`<br>`src/stores/runtime.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeExports.java`<br>`ios/Sources/NativeTools.swift` |
| `beginKeepaliveSave` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1002` | Android保活模块 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeExports.java` |
| `beginPageSync` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1010` | 页面缓存与更新 | `src/core/updates.ts`<br>`src/core/cache.ts`<br>`scripts/build-sw.mjs`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelCache.java` |
| `beginPageUpdate` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1044` | 页面缓存与更新 | `src/core/updates.ts`<br>`src/core/cache.ts`<br>`scripts/build-sw.mjs`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelCache.java` |
| `beginPanelLine` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1073` | 页面缓存与更新 | `src/core/updates.ts`<br>`src/core/cache.ts`<br>`scripts/build-sw.mjs`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelCache.java` |
| `beginWidgetPreview` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1123` | 桌面组件与快捷入口 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelWidget.java`<br>`ios/Widget/GeometryWidget.swift`<br>`ios/Sources/NativeShortcuts.swift` |
| `cancelPanelLine` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1199` | 页面缓存与更新 | `src/core/updates.ts`<br>`src/core/cache.ts`<br>`scripts/build-sw.mjs`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelCache.java` |
| `captureDiag` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1215` | 官方登录连接 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/OfficialCaptureService.java` |
| `captureStatus` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1220` | 官方登录连接 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/OfficialCaptureService.java` |
| `chargeLog` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1233` | 电池与充电历史 | `src/stores/workflows/background.ts`<br>`src/core/history.ts`<br>`src/core/history-store.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/BackgroundMonitor.java`<br>`ios/Sources/NativeHistory.swift` |
| `checkAppUpdate` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1258` | 安装包更新 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeUpdates.java`<br>`ios/Sources/NativeTools.swift` |
| `checkPageUpdate` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1291` | 页面缓存与更新 | `src/core/updates.ts`<br>`src/core/cache.ts`<br>`scripts/build-sw.mjs`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelCache.java` |
| `clearCapture` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1340` | 官方登录连接 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/OfficialCaptureService.java` |
| `clearCaptureDiag` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1346` | 官方登录连接 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/OfficialCaptureService.java` |
| `clearNotifyLog` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1352` | 分类提醒与日志 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeNotifications.java`<br>`ios/Sources/NativeBackground.swift` |
| `copyCaptureDiag` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1388` | 官方登录连接 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/OfficialCaptureService.java` |
| `downloadAppUpdate` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1394` | 安装包更新 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeUpdates.java`<br>`ios/Sources/NativeTools.swift` |
| `dynamicColors` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1400` | 主题与安全区 | `src/core/preferences.ts`<br>`src/theme/tokens.css` |
| `imageExportInfo` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1443` | 车况图片导出 | `src/core/panel-export.ts`<br>`src/stores/runtime.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeExports.java`<br>`ios/Sources/NativeTools.swift` |
| `inductiveCapabilities` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1454` | 蓝牙钥匙 | `src/stores/workflows/native.ts`<br>`src/api/native-materials.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/BleClient.java`<br>`ios/Sources/BluetoothKey.swift` |
| `insets` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1463` | 主题与安全区 | `src/core/preferences.ts`<br>`src/theme/tokens.css` |
| `keepaliveModuleInfo` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1487` | Android保活模块 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeExports.java` |
| `keepaliveStatus` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1499` | Android保活模块 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeExports.java` |
| `launchOfficialApp` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1506` | 官方登录连接 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/OfficialCaptureService.java` |
| `notifyGroups` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1512` | 分类提醒与日志 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeNotifications.java`<br>`ios/Sources/NativeBackground.swift` |
| `notifyLog` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1532` | 分类提醒与日志 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeNotifications.java`<br>`ios/Sources/NativeBackground.swift` |
| `openInductive` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1550` | 蓝牙钥匙 | `src/stores/workflows/native.ts`<br>`src/api/native-materials.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/BleClient.java`<br>`ios/Sources/BluetoothKey.swift` |
| `openMeterOta` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1556` | 仪表工具 | `src/api/meter.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/GeminiOtaActivity.java`<br>`ios/Sources/NativeTools.swift` |
| `openOfficialApp` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1562` | 官方登录连接 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/OfficialCaptureService.java` |
| `openSettings` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1568` | 平台设置 | `src/stores/workflows/native.ts`<br>`src/stores/workflows/background.ts`<br>`ios/Sources/NativeTools.swift` |
| `openWallpaperTransfer` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1574` | 仪表工具 | `src/api/meter.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/GeminiOtaActivity.java`<br>`ios/Sources/NativeTools.swift` |
| `pageReady` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1581` | 页面缓存与更新 | `src/core/updates.ts`<br>`src/core/cache.ts`<br>`scripts/build-sw.mjs`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelCache.java` |
| `pageReadyV2` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1587` | 页面缓存与更新 | `src/core/updates.ts`<br>`src/core/cache.ts`<br>`scripts/build-sw.mjs`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelCache.java` |
| `panelLineInfo` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1597` | 页面缓存与更新 | `src/core/updates.ts`<br>`src/core/cache.ts`<br>`scripts/build-sw.mjs`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelCache.java` |
| `panelLineVersion` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1617` | 页面缓存与更新 | `src/core/updates.ts`<br>`src/core/cache.ts`<br>`scripts/build-sw.mjs`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelCache.java` |
| `pendingPrize` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1622` | 签到与社区任务 | `src/api/tasks.ts`<br>`src/core/tasks-model.ts`<br>`src/stores/workflows/tasks.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeTasks.java`<br>`ios/Sources/NativeTasks.swift` |
| `pollAppLog` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1653` | 诊断与应用日志 | `src/core/command-report.ts`<br>`src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeExports.java`<br>`ios/Sources/NativeTools.swift` |
| `pollAppUpdate` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1658` | 安装包更新 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeUpdates.java`<br>`ios/Sources/NativeTools.swift` |
| `pollBatteryHistory` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1683` | 电池与充电历史 | `src/stores/workflows/background.ts`<br>`src/core/history.ts`<br>`src/core/history-store.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/BackgroundMonitor.java`<br>`ios/Sources/NativeHistory.swift` |
| `pollBatterySpan` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1702` | 电池与充电历史 | `src/stores/workflows/background.ts`<br>`src/core/history.ts`<br>`src/core/history-store.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/BackgroundMonitor.java`<br>`ios/Sources/NativeHistory.swift` |
| `pollCacheManagement` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1707` | 页面缓存与更新 | `src/core/updates.ts`<br>`src/core/cache.ts`<br>`scripts/build-sw.mjs`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelCache.java` |
| `pollChargeHistory` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1712` | 电池与充电历史 | `src/stores/workflows/background.ts`<br>`src/core/history.ts`<br>`src/core/history-store.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/BackgroundMonitor.java`<br>`ios/Sources/NativeHistory.swift` |
| `pollDiagStore` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1717` | 诊断与应用日志 | `src/core/command-report.ts`<br>`src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeExports.java`<br>`ios/Sources/NativeTools.swift` |
| `pollImageExport` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1722` | 车况图片导出 | `src/core/panel-export.ts`<br>`src/stores/runtime.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeExports.java`<br>`ios/Sources/NativeTools.swift` |
| `pollKeepaliveSave` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1727` | Android保活模块 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeExports.java` |
| `pollPageSync` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1732` | 页面缓存与更新 | `src/core/updates.ts`<br>`src/core/cache.ts`<br>`scripts/build-sw.mjs`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelCache.java` |
| `pollPageUpdate` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1744` | 页面缓存与更新 | `src/core/updates.ts`<br>`src/core/cache.ts`<br>`scripts/build-sw.mjs`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelCache.java` |
| `pollPanelLine` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1771` | 页面缓存与更新 | `src/core/updates.ts`<br>`src/core/cache.ts`<br>`scripts/build-sw.mjs`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelCache.java` |
| `pollWidgetPreview` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1783` | 桌面组件与快捷入口 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelWidget.java`<br>`ios/Widget/GeometryWidget.swift`<br>`ios/Sources/NativeShortcuts.swift` |
| `prizeCelebrated` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1814` | 签到与社区任务 | `src/api/tasks.ts`<br>`src/core/tasks-model.ts`<br>`src/stores/workflows/tasks.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeTasks.java`<br>`ios/Sources/NativeTasks.swift` |
| `releaseTrustVersion` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1821` | 安装包更新 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeUpdates.java`<br>`ios/Sources/NativeTools.swift` |
| `requestAddWidget` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1826` | 桌面组件与快捷入口 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelWidget.java`<br>`ios/Widget/GeometryWidget.swift`<br>`ios/Sources/NativeShortcuts.swift` |
| `requestNotifications` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1861` | 分类提醒与日志 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeNotifications.java`<br>`ios/Sources/NativeBackground.swift` |
| `resetWidgetSettings` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1867` | 桌面组件与快捷入口 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelWidget.java`<br>`ios/Widget/GeometryWidget.swift`<br>`ios/Sources/NativeShortcuts.swift` |
| `resignedUpdateException` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1897` | 安装包更新 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeUpdates.java`<br>`ios/Sources/NativeTools.swift` |
| `restartBackground` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1902` | 后台监控 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/BackgroundMonitor.java`<br>`ios/Sources/NativeBackground.swift` |
| `restartPage` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1908` | 页面缓存与更新 | `src/core/updates.ts`<br>`src/core/cache.ts`<br>`scripts/build-sw.mjs`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelCache.java` |
| `setAutoTask` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1914` | 签到与社区任务 | `src/api/tasks.ts`<br>`src/core/tasks-model.ts`<br>`src/stores/workflows/tasks.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeTasks.java`<br>`ios/Sources/NativeTasks.swift` |
| `setAutoTaskScope` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1940` | 签到与社区任务 | `src/api/tasks.ts`<br>`src/core/tasks-model.ts`<br>`src/stores/workflows/tasks.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeTasks.java`<br>`ios/Sources/NativeTasks.swift` |
| `setBackground` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1962` | 后台监控 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/BackgroundMonitor.java`<br>`ios/Sources/NativeBackground.swift` |
| `setDark` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1987` | 主题与安全区 | `src/core/preferences.ts`<br>`src/theme/tokens.css` |
| `setInductiveTheme` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:1993` | 主题与安全区 | `src/core/preferences.ts`<br>`src/theme/tokens.css` |
| `setNotifyGroup` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2037` | 分类提醒与日志 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeNotifications.java`<br>`ios/Sources/NativeBackground.swift` |
| `setThemeColors` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2187` | 主题与安全区 | `src/core/preferences.ts`<br>`src/theme/tokens.css` |
| `setWidgetSetting` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2196` | 桌面组件与快捷入口 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelWidget.java`<br>`ios/Widget/GeometryWidget.swift`<br>`ios/Sources/NativeShortcuts.swift` |
| `setWidgetSettingFor` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2201` | 桌面组件与快捷入口 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelWidget.java`<br>`ios/Widget/GeometryWidget.swift`<br>`ios/Sources/NativeShortcuts.swift` |
| `setWidgetStats` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2230` | 桌面组件与快捷入口 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelWidget.java`<br>`ios/Widget/GeometryWidget.swift`<br>`ios/Sources/NativeShortcuts.swift` |
| `setWidgetStatsForSize` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2258` | 桌面组件与快捷入口 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelWidget.java`<br>`ios/Widget/GeometryWidget.swift`<br>`ios/Sources/NativeShortcuts.swift` |
| `startCapture` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2304` | 官方登录连接 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/OfficialCaptureService.java` |
| `stopCapture` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2310` | 官方登录连接 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/OfficialCaptureService.java` |
| `storeAll` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2316` | 本机存储 | `src/core/vault.ts`<br>`src/core/accounts.ts` |
| `storeBootstrap` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2341` | 本机存储 | `src/core/vault.ts`<br>`src/core/accounts.ts` |
| `storeCommit` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2374` | 本机存储 | `src/core/vault.ts`<br>`src/core/accounts.ts` |
| `storeCommitBegin` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2389` | 本机存储 | `src/core/vault.ts`<br>`src/core/accounts.ts` |
| `storeCommitPoll` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2430` | 本机存储 | `src/core/vault.ts`<br>`src/core/accounts.ts` |
| `storePut` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2458` | 本机存储 | `src/core/vault.ts`<br>`src/core/accounts.ts` |
| `storeRemove` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2463` | 本机存储 | `src/core/vault.ts`<br>`src/core/accounts.ts` |
| `storeVersion` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2472` | 本机存储 | `src/core/vault.ts`<br>`src/core/accounts.ts` |
| `syncSession` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2477` | 账号作用域 | `src/core/accounts.ts`<br>`src/core/background.ts`<br>`src/stores/workflows/accounts.ts` |
| `syncSessionV2` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2531` | 账号作用域 | `src/core/accounts.ts`<br>`src/core/background.ts`<br>`src/stores/workflows/accounts.ts` |
| `syncStatus` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2542` | 账号作用域 | `src/core/accounts.ts`<br>`src/core/background.ts`<br>`src/stores/workflows/accounts.ts` |
| `taskAccountParamsVersion` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2591` | 账号作用域 | `src/core/accounts.ts`<br>`src/core/background.ts`<br>`src/stores/workflows/accounts.ts` |
| `updateStatus` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2596` | 安装包更新 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeUpdates.java`<br>`ios/Sources/NativeTools.swift` |
| `widgetAddStatus` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2613` | 桌面组件与快捷入口 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelWidget.java`<br>`ios/Widget/GeometryWidget.swift`<br>`ios/Sources/NativeShortcuts.swift` |
| `widgetSettings` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2618` | 桌面组件与快捷入口 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelWidget.java`<br>`ios/Widget/GeometryWidget.swift`<br>`ios/Sources/NativeShortcuts.swift` |
| `widgetSettingsFor` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2623` | 桌面组件与快捷入口 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelWidget.java`<br>`ios/Widget/GeometryWidget.swift`<br>`ios/Sources/NativeShortcuts.swift` |
| `widgetSettingsForSize` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2675` | 桌面组件与快捷入口 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/PanelWidget.java`<br>`ios/Widget/GeometryWidget.swift`<br>`ios/Sources/NativeShortcuts.swift` |
| `requestResignedUpdateException` | `io/github/lswlc33/zeehowebnext/ShellBridge.java:2715` | 安装包更新 | `src/stores/workflows/background.ts`<br>`android/app/src/main/java/app/geometrypanel/mobile/NativeUpdates.java`<br>`ios/Sources/NativeTools.swift` |

## 原版本身的限制与平台差异

- 原版最大限速仅显示数值，命令71没有确证写合同；复杂长按/左右/组合键原版也未适配，保留只读说明。单击命令142已恢复。证据见 extensions-protocol.md。
- 原版BLE2/3、成熟自动靠近解锁、投屏音频和反控都没有完整实现，不把这些包装成已验证功能。
- iOS没有Android Wi-Fi Direct、Root模块或官方应用VPN连接；用手动热点、系统机会后台、短信登录、自签安装替代。
- 所有新增设备/车辆效果待集中验收。自动检查只使用合成数据；未发送真实短信、社区写操作、车辆指令、蓝牙/Wi-Fi/OTA。
- 0.7.0 已完成字体、布局、主题、品牌、页面和动效重构；3D 车辆展示与专属车图上传按设计规范留在后续批次。
- 0.7.0 按 117 个入口与 20 组复核实现文件，并将功能迁移到四栏页面；路由对应、验证证据与偏离说明见本次交付包。

机器可读117项清单见 original-parity.json；每条附旧静态位置和新文件归属。
