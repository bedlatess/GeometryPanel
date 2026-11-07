# 原生桥与恢复范围（0.5.0）

网页共用云端业务；Android Java / iOS Swift 仅承担系统能力。原生方法协议为 v1，方法白名单在 `src/core/native.ts`。恢复依据是原作者授权 APK 的静态实现，不是实车证明。

## 数据与生命周期

- Android 使用受来源约束的 WebMessageListener，iOS 使用 WKScriptMessageHandler；仅接受主框架、正式 HTTPS 域名和 `/GeometryPanel/` 页面。地图 iframe 没有原生操作权限。没有任意 HTTP/TCP/Java 调用桥。
- 请求使用随机会话标识和递增编号匹配，限制并发、大小和超时；网页不显示原生原始错误信息，避免把材料或底层响应带进排查摘要。
- 蓝牙资料来自当次首页和设置读取。核对 VIN、当前账号的 bindingUserId、非共享状态；材料绑定凭据摘要，五分钟内有效。原生再次检查。蓝牙准备只提供白名单材料；0.5.0新增的原生后台/任务/桌面控制，仅在独立授权后接收必要凭据并本机加密。完整合同见 parity-bridge-v2.md。
- Android 使用 Keystore 加密存储，iOS 使用设备 Keychain。账号、钥匙、Wi-Fi 配对码不进入版本库或日志。组件读数更新只接收车辆昵称、读数、读取时间和随机本机vehicleId；控制绑定来自另行授权的原生加密账号，读数与控制目标必须一致，不把凭据放进桌面入口。
- 退出和换车先清除原生车辆作用域；过期关闭子面板并清理。关闭正在进行的蓝牙操作会请求断连，并显示结果未确认，不能视为已撤销车端改变。

## 实现与证据边界

| 能力 | 实现 | 仍须确认 |
|---|---|---|
| BLE1 | GATT 服务/特征、通知和分块、challenge-response、2.0 手机登记、云端保存及车端查询、遥测/仪表订阅 | 云材料是否下发、车型/固件响应、系统配对效果 |
| 连接提醒 | 用户主动开启；Android 前台服务，iOS CoreBluetooth 连接变化通知 | 后台策略、实机距离与耗电；不等于自动解锁 |
| 通知与组件 | 基于最新一次云端读取或蓝牙采样的本地提醒；带时间的桌面摘要 | 系统权限、系统刷新安排；Android前台服务及15分钟后备，iOS机会刷新 |
| 壁纸 | 从云端选择模板编号/显示配置；原生选择两图、按真实分辨率合成受限 ZIP，固定车端协议传输 | 兼容仪表和实际显示；缺少配置不猜默认 |
| 投屏 | 旧三通道协议、H.264、Android MediaProjection / iOS ReplayKit 应用内画面 | 车端握手和编码器兼容性；无音频和反控 |

旧 APK 把 `automaticUnlockVerified=false`、`supportedBle2=false`、`testBuild=true` 写为常量。本项目保留此边界，不补猜开锁命令，不把 RSSI 接近提醒标成自动解锁。iOS 不提供通用 Wi-Fi Direct，需要手动连接车辆 Wi-Fi；iOS 不提供按 MAC 连接 BLE 的能力，需要在车旁扫描、选择并认证。

原始静态证据保存在工作区的 `analysis/zeehowebnext-1.8.12/BLE_KEYS.md` 和 `METER_CAST.md`。APK 初始 REA Evidence：`ev_da00a0bbe6c5b51c3cc180ceca2764803730ac7c189818cbc21f025a94986e48`；这些证据说明包内实现，不能证明本次重写已在车辆运行。

云端感应开关：`t5.c(3)` + `b6.h` + `y6.B`，POST `airLock/setting`，body 为 `inductiveUnlockType:"", openStatus:0|1, uniqueIdentify:"", vinNo`；完成后重新 GET settings 核对。手机登记：`q6` 调 `b6.h(4,1,"2.0",identity)`，body 与开关不同；收到车端登记 ACK 后才发云端 save，随后查询车端，不把单个 HTTP 成功当作完整成功。

## 可复现验证

`npm test`、`npm run build`、`npm run test:browser`；`npm run android:build`；iOS 在 macOS Actions 运行 `bash ios/scripts/build.sh`，先跑模拟器测试，再编译两个 arm64 设备应用和打包 unsigned IPA。iOS 本机 Windows 不能编译；以对应提交的云端结果为准。自动测试只使用合成协议数据，未执行真实短信、账号读取、车控或仪表传输。

Safari 不提供上述原生能力，继续支持已接入的云端功能和主屏幕入口。普通 unsigned IPA 可供使用者自签；组件版另需支持 App Groups 的签名资料。unsigned 文件本身不能直接安装运行。
