# Android 安装包

Android 8.0 及以上安装 GitHub Release 中的 `GeometryPanel-版本.apk`。应用固定打开 `https://bedlatess.github.io/GeometryPanel/`，网页的登录、车况、地图、车控和设置与 iPhone 网页共用。网页业务更新走现有更新流程；蓝牙、仪表、通知等原生代码变化需要更新 APK。`panel-android/` 保留作前期参考。

首次打开需联网，并在 APK 中连接一次账号；浏览器与 APK 各自保存登录。使用同一签名、版本号更高的 APK 可覆盖升级，保留本机数据。不要先卸载；卸载会清除登录和原生资料。

## 0.4.0 原生功能

用车页“蓝牙、提醒与仪表工具”会识别 APK，再按需申请系统权限。没有相应硬件或权限时显示原因，不用模拟结果替代连接。

- **蓝牙**：只扫描和连接当前已验证的本人车辆；恢复旧包 BLE1 的服务、认证、登记/查询、配对和车况订阅。准备资料需新读取的车主资料，有效期五分钟；换车、退出、取消和页面离开会断开相应连接。BLE 读数标明来自旧协议静态恢复，车型含义尚待实车核对，不用于触发低电量通知。
- **靠近提醒**：用户主动开启后在通知栏运行短时连接服务；只根据绑定车辆信号提醒，提供停止入口。资料过期或换车后停止，不执行自动开锁。
- **低电量通知与桌面组件**：使用最近一次在本机读取的云车况。组件显示更新时间，超过三十分钟标为旧数据；长按 Android 桌面添加“几何面板车况”。没有后台云端轮询。退出或忘记资料会清除摘要并关闭提醒。
- **仪表壁纸**：使用实际车型模板和分辨率，系统文件选择器选择两张照片或合规 ZIP；照片在本机裁切为模板尺寸，ZIP 严格检查根目录 `1.png`、`2.png`、尺寸和 CRC。确认后才连接当前仪表并发送。等待连接或发送时离开页面会取消；请求已经发出时明确提示结果未知。
- **仪表投屏**：通过本次系统屏幕采集授权和前台通知，恢复旧包三通道 H.264 拉流协议。仅向已核对的车辆 Wi-Fi Direct 对端发送；通知栏随时停止。兼容上限 1280 × 720、30 帧、4 Mbps，没有音频和反向触控。

原 APK 的协议依据见工作区 `analysis/zeehowebnext-1.8.12/BLE_KEYS.md`、`METER_CAST.md` 和相关 Java 静态证据。静态恢复和自动检查不等同于实车成功。BLE2/3 钥匙配对、自动解锁、OTA 及其它没有充分证据的写入没有补猜指令。

## 连接与资料边界

原生桥采用 AndroidX WebKit `WebViewCompat.addWebMessageListener`，仅接受正式域名的顶层主页面，且当前页面必须位于 `/GeometryPanel/`；不使用 `addJavascriptInterface`。高德 iframe 不可调用桥。桥仅开放功能白名单，检查请求 ID、大小、并发、页面生命周期和车辆归属；不提供任意 URL/TCP/文件读取接口。

车辆钥匙、登记标识和仪表配对资料经 Android Keystore AES-GCM 加密后存入不参与备份的目录。状态和日志不返回钥匙、VIN、MAC 或账号响应。系统服务使用合规前台通知；不设置开机启动，不在进程重启后自动连接。忘记本机资料不会撤销系统蓝牙配对或车端钥匙。

仪表连接先核对实际 P2P 组主 MAC、私有 IPv4、组接口及子网，再创建绑定该网络/源地址的 Socket。部分手机不通过 `ConnectivityManager` 暴露 P2P 网络，此时按旧包实现核对真实接口，拒绝 VPN 和竞争网络/路由后绑定源地址；不退成默认路由。连接只允许原协议端口，对入站连接检查实际组主 IP。

应用按需申请蓝牙扫描/连接、附近 Wi-Fi、通知和前台服务权限；Android 12 及更早版本的蓝牙/Wi-Fi Direct 还需要系统定位权限及相应开关。文件使用系统选择器，无通用存储权限。主页面不开放 WebView 定位、文件访问、混合内容、调试或证书绕过。禁用云备份与设备迁移备份。

外部 HTTPS 链接交给系统浏览器；阻止文件、`javascript:`、`intent:` 等主页面导航。网页地图位于隔离 iframe。Android 返回键优先点击网页弹窗的关闭按钮，保留网页取消/确认语义；关闭按钮禁用时不强行绕过。

## 本机构建与检查

需要 Node.js 24、JDK 21、Android SDK `android-36`、build-tools `36.0.0`。Windows 在网页工程根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android.ps1
```

脚本运行 JVM 单元测试、真实网页 NativeClient 的合成桥契约检查、模拟返回场景、release lint、签名构建和 APK 签名校验。`0.4.0` 当前为 21 项 JVM 测试、12 个真实客户端方法/请求 ID 场景、4 个返回场景；都是本地合成测试，没有发送真实短信、云账号请求、蓝牙或车辆命令。`verification/android-check.json` 记录构建、清单、签名、对齐和边界。

版本读取 `package.json`，例如 `0.4.0` 对应版本代码 `4000`。原生代码变化也应递增版本；必要时通过 `GEOMETRY_VERSION_CODE` 指定更高版本代码。产物：

```text
android/app/build/outputs/apk/release/GeometryPanel-版本.apk
android/app/build/outputs/apk/release/verification.json
```

首次本机构建会生成被 Git 忽略的 `android/.signing/`。**将整个目录备份到自己的私密安全位置，不能上传 GitHub 或发送聊天。** 丢失签名将无法覆盖升级已有安装。脚本发现私钥缺失会报错，不会悄悄更换。发布仅上传 APK、摘要和公开验证记录。

macOS/Linux 可在同等 SDK 下进入 `android/` 运行 `bash ./gradlew :app:testReleaseUnitTest :app:lintRelease :app:assembleRelease`。签名参数使用环境变量 `GEOMETRY_KEYSTORE`、`GEOMETRY_STORE_PASSWORD`、`GEOMETRY_KEY_PASSWORD`、`GEOMETRY_KEY_ALIAS`。

## GitHub 自动检查

`.github/workflows/android.yml` 安装 npm 依赖并运行桥检查，再运行 JVM 测试、lint 和 debug 构建。SDK 初始化使用 `platform-tools`，再安装 Android 36 / build-tools 36.0.0。`GeometryPanel-Android-debug-CI-only` 使用独立 `.debug` 包名，仅供检查。

若仓库配置同一私钥的 `GEOMETRY_KEYSTORE_BASE64` 和上述签名 secrets，CI 还生成可升级的正式签名 APK；否则正式包使用本机稳定签名构建。私钥和密码不进入仓库。

当前没有连接 Android 实机或模拟器；编译、签名、协议单元测试和浏览器合成检查都不能称为 Android 运行或实车验收。实际系统权限、后台时长、蓝牙广播/配对、车型读数、仪表 Wi-Fi、画面与安装升级纳入最终集中验收。
