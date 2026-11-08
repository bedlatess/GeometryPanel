# iOS 原生协议证据与边界

本次迁移复用已授权旧包 1.8.12 的静态证据。没有运行旧 APK、读取抓包数据库、请求真实账号或连接车辆。

| 实现 | 静态来源 | 本次处理 |
|---|---|---|
| GATT UUID、写入和通知 | `BLE_KEYS.md` 第 3 节；旧 `e.java/y6.java` | CoreBluetooth 替换 Android GATT，保留 UUID 和单事务约束 |
| 外帧与 protobuf | `BLE_KEYS.md` 第 4 节；旧 `zc.java` | 严格解析，240 字节 payload、2048 字节重组上限、重复字段拒绝 |
| 认证、登记和查询 | `BLE_KEYS.md` 第 5 节；旧 `h5/i/o6/q6/r6` | 两步认证、登记 ACK、车端查询分开；云 save 由共用网页执行 |
| 资料授权 | `BLE_KEYS.md` 第 2/6 节 | 原生再次校验 owner/VIN/凭据摘要和五分钟新鲜度，钥匙进设备 Keychain；不会把材料发回网页 |
| 壁纸容器 / 下载 | `METER_CAST.md` 第 4 节 | 选两图生成窄ZIP；本地和官方ZIP检查central/local/descriptors、路径、属性、CRC、压缩比及PNG结构；仅两个原包OSS HTTPS来源，每跳重新校验 |
| 壁纸 TCP | `METER_CAST.md` 第 4.4 节；旧 `z1.java` | 元数据、分块、结束 ACK、最终 ACK；断开后提示结果未知 |
| 投屏控制/媒体/拉帧 | `METER_CAST.md` 第 5 节；旧 `k1/q1/s2/w1` | 保留帧格式和协议响应，适配 iOS 自身屏幕采集和 H.264 编码 |
| Gemini OTA | `METER_CAST.md` 第3节；旧 `h9/i/f0` | 固定10086、大端10字节头、版本查询、元数据ACK、4096字节块、结束 / 最终响应；512MiB上限，二次确认，中断结果未知 |
| 云监控 / 历史 | `VEHICLE_API.md`，现网页已确证读取模型 | 原生固定APP签名与端点；无任意请求桥。Keychain凭据、AES-GCM本地历史；缺测与未知值保留为未知 |
| 自动任务 | `docs/dev/verification/parity-bridge-v2.md`；旧 `k0/j0/ta` | APP / H5签名分开，逐步读后核实，资格不明跳过，每日尝试门闩；新文章以ID/作者/原文/时间/基线严格确证，仅本次帖子可清理 |

这些本地文档追溯到 REA 原包证据 `ev_da00a0bbe6c5b51c3cc180ceca2764803730ac7c189818cbc21f025a94986e48`；原 APK SHA256 为 `50138c01db2d51f27cf0e8c9ae4eba475b8ccea3a97cc399b8b9334f843f566c`。静态证据不能确认服务端、车型、蓝牙响应或仪表兼容率。

本机默认身份和蓝牙材料使用 Keychain `WhenUnlockedThisDeviceOnly`；用户主动启用的多账号资料和本地历史主密钥使用 `AfterFirstUnlockThisDeviceOnly`，以支持系统允许的后台刷新。历史文件以AES-GCM加密并排除备份。系统配对、Wi-Fi Direct、后台执行和应用间屏幕采集不套用Android假设。常规版与组件版分开构建，让普通自签不依赖App Groups。后台为机会调度，组件明确标注上次读取。

`NativeParityTests` 使用独立Python签名/压缩ZIP向量及合成状态，覆盖APP/H5签名、未知读数、充电缺测、ZIP/PNG篡改、资源URL边界、OTA帧、epoch和精确发帖清理。其结果必须以macOS XCTest实际运行结果为准，不等于iPhone或车辆验收。

未解决的硬件问题：iOS 扫描能否看见该车型、服务和特征是否要求系统配对、车端是否接受 2.0 登记、是否支持手动 Wi-Fi 热点及 iOS 投屏握手、实际编码显示方向/延迟。它们需要最终实机验收，自动测试不会替代。
