# Android 安装包

这是当前网页主工程的薄容器，固定打开正式 HTTPS 网址 `https://bedlatess.github.io/GeometryPanel/`。登录、车况、地图、车控和配置继续使用 `src/` 的同一套实现，网页更新后 APK 也使用同一更新流程，无需为每次网页修复重打包。`panel-android/` 仍只是早期协议验证参考。

## 用户安装

在 Android 8.0 及以上、已更新 Android System WebView/Chrome 的手机上安装 GitHub Release 中的 `GeometryPanel-版本.apk`。系统询问时允许当前浏览器安装该 APK 即可。首次打开需要联网，并在 APK 中连接一次账号；浏览器和 APK 分别保存登录，不会搬运浏览器里的账号数据。

以后安装使用同一签名、版本号更高的 APK，可覆盖升级并保留本机登录与配置。不要为了更新先卸载；卸载会删除 APK 的本机数据。网页内容版本仍可在面板设置中查看并更新。

用车页内的高德地图保持在隔离的网页弹窗中；“在高德中打开”和步行路线用系统浏览器打开。APK 不申请定位、蓝牙或存储权限。路线网页可能另行询问手机定位权限。配置继续在网页里复制、粘贴导入，无原生账号接口。

成功联网打开并完成网页静态缓存后，离线可以重开页面；读取车况和车控需要联网。首次打开没有缓存或网页加载失败时，会显示原生重试页。Android WebView 的实际缓存、键盘、地图跳转和登录恢复仍以真实手机集中验收为准。

## 本机构建

需要 Node.js 24、JDK 21、Android SDK 平台 `android-36`、构建工具 `36.0.0`。建议设置 `JAVA_HOME` 和 `ANDROID_HOME`。

Windows 从网页工程根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android.ps1
```

脚本会运行两项 URL 策略测试、四个模拟弹窗返回场景、Android release lint、签名构建和 APK 签名校验。版本读取 `package.json`，例如 `0.3.1` 对应版本代码 `3001`；原生变更发布时也应递增版本。必要时可通过 `GEOMETRY_VERSION_CODE` 指定更高代码。

首次本机构建自动生成 `android/.signing/`，里面包含私钥和随机密码文件，均被 Git 忽略。**应将整个目录备份到自己的私密安全位置，不能上传 GitHub 或发到聊天。** 丢失签名就无法覆盖升级现有 APK，只能卸载重装。脚本发现私钥缺失时会报错，不会静默换钥匙。

产物是 `android/app/build/outputs/apk/release/GeometryPanel-版本.apk`；同目录 `verification.json` 记录 SHA-256 和自动检查边界，不包含账号。发布时只上传 APK 和校验摘要，不上传 `.signing/`、`local.properties` 或构建目录。

macOS/Linux 可安装同等 SDK 后，在 `android/` 运行 `bash ./gradlew :app:testReleaseUnitTest :app:lintRelease :app:assembleRelease`，签名参数通过以下环境变量提供：

- `GEOMETRY_KEYSTORE`：私钥文件绝对路径。
- `GEOMETRY_STORE_PASSWORD`、`GEOMETRY_KEY_PASSWORD`：对应密码。
- `GEOMETRY_KEY_ALIAS`：私钥别名。

## GitHub 自动检查与签名

`.github/workflows/android.yml` 运行同样的单元测试和 lint，并生成 `GeometryPanel-Android-debug-CI-only` 检查产物。它使用 `.debug` 包名，与正式验收包分开，不能当作稳定升级渠道。

如需在 CI 中生成相同签名的正式包，将本机同一私钥的 Base64 内容保存到仓库 Actions secret `GEOMETRY_KEYSTORE_BASE64`，并配置 `GEOMETRY_STORE_PASSWORD`、`GEOMETRY_KEY_PASSWORD`、`GEOMETRY_KEY_ALIAS`。流水线才会额外上传 `GeometryPanel-Android-signed-release`，不会在没有稳定私钥时冒充正式签名。当前发布 APK 可直接由助手本机构建后上传 GitHub Release。

## 容器边界

- 主页面只能是正式域名的 `/GeometryPanel/` 路径；外部 HTTPS 链接交给浏览器，阻止文件、`javascript:`、`intent:` 等导航。
- 高德等 HTTPS 子页面保留在 iframe 中，不把地图加载误当作主页面跳转。
- 不添加 `addJavascriptInterface` 或其它原生桥；账号加密存储仍由现有网页处理。
- 不绕过跨域策略或证书错误，不缓存 API 响应，不记录地址、凭据或车辆信息。
- 禁止云备份和设备迁移备份，不开放 WebView 调试；退出和清理登录仍由网页操作完成。
- Android 系统返回先关闭弹窗，再退回网页历史或退出。没有后台常驻、蓝牙钥匙、OTA 或通知服务。

自动检查只证明构建、策略和静态配置；没有 Android 实机或模拟器时，不把这些检查称为手机运行验收。网页现有 Chromium/WebKit 合成测试也不代表真实车辆执行。
