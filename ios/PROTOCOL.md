# iOS 原生协议证据与边界

本次迁移复用已授权旧包 1.8.12 的静态证据。没有运行旧 APK、读取抓包数据库、请求真实账号或连接车辆。

| 实现 | 静态来源 | 本次处理 |
|---|---|---|
| GATT UUID、写入和通知 | `BLE_KEYS.md` 第 3 节；旧 `e.java/y6.java` | CoreBluetooth 替换 Android GATT，保留 UUID 和单事务约束 |
| 外帧与 protobuf | `BLE_KEYS.md` 第 4 节；旧 `zc.java` | 严格解析，240 字节 payload、2048 字节重组上限、重复字段拒绝 |
| 认证、登记和查询 | `BLE_KEYS.md` 第 5 节；旧 `h5/i/o6/q6/r6` | 两步认证、登记 ACK、车端查询分开；云 save 由共用网页执行 |
| 资料授权 | `BLE_KEYS.md` 第 2/6 节 | 原生再次校验 owner/VIN/凭据摘要和五分钟新鲜度，钥匙进设备 Keychain；不会把材料发回网页 |
| 壁纸容器 | `METER_CAST.md` 第 4 节 | 不接受任意 ZIP；系统选图后本机重编码生成窄结构 ZIP，限制尺寸、像素和合计字节 |
| 壁纸 TCP | `METER_CAST.md` 第 4.4 节；旧 `z1.java` | 元数据、分块、结束 ACK、最终 ACK；断开后提示结果未知 |
| 投屏控制/媒体/拉帧 | `METER_CAST.md` 第 5 节；旧 `k1/q1/s2/w1` | 保留帧格式和协议响应，适配 iOS 自身屏幕采集和 H.264 编码 |

这些本地文档追溯到 REA 原包证据 `ev_da00a0bbe6c5b51c3cc180ceca2764803730ac7c189818cbc21f025a94986e48`；原 APK SHA256 为 `50138c01db2d51f27cf0e8c9ae4eba475b8ccea3a97cc399b8b9334f843f566c`。静态证据不能确认服务端、车型、蓝牙响应或仪表兼容率。

本次设计选择：本机存储使用 iOS Keychain 的 `WhenUnlockedThisDeviceOnly`；系统配对、Wi-Fi Direct、后台执行和应用间屏幕采集不套用 Android 假设。常规版与组件版分开构建，让普通自签不必依赖 App Groups。后台提醒没有实时云轮询，组件明确标注上次读取。

未解决的硬件问题：iOS 扫描能否看见该车型、服务和特征是否要求系统配对、车端是否接受 2.0 登记、是否支持手动 Wi-Fi 热点及 iOS 投屏握手、实际编码显示方向/延迟。它们需要最终实机验收，自动测试不会替代。
