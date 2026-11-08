# 日常车控协议与检查范围

本批新增 `VehicleControls.execute(session, action, signal?, onProgress?)`，动作包括 `powerOn`（开机/解锁）、`powerOff`（关机/锁车）、`seat`（打开座桶）。它们会改变车辆状态，界面应按明确动作确认，不能只以锁图标的猜测状态决定发什么请求。接口受理不代表车辆已经执行。

## 恢复发布物中的请求

| 动作 | 请求顺序 | 恢复证据 |
|---|---|---|
| 开机/解锁 | POST `dbpoint/send`，参数 `ON_AND_OFF,ON`；随后 POST `vehicleSet/network/unlock`，`lockFlag=1` | inline-28.decoded.js `_0x13430c.lockOn.steps`，字符偏移 60311–60452 |
| 关机/锁车 | POST `dbpoint/send`，参数 `ON_AND_OFF,OFF`；随后 POST `vehicleSet/network/unlock`，`lockFlag=0` | 同文件 `lockOff.steps`，偏移 60489–60631 |
| 打开座桶 | PUT `vehicleSet/propertyTwo/one`，`commond="28", commondParam="1", relatedFunctions=null, vcu=<VIN>, version="v2"` | 同文件 `cushion.steps`，偏移 60219–60275；inline-12.decoded.js `writeBody`，偏移 121782–122547 |

以上路径都以 `/v1.0/app/cfmotoserverapp/` 开头，完整端点来自 inline-10.decoded.js。请求形状见 [recovered-controls-contract.json](recovered-controls-contract.json)，含源文件 SHA-256 和选定表达式偏移。契约通过 TypeScript AST 读取旧文件，只解释常量、对象、数组及已知构造器的返回表达式；没有执行旧发布脚本、网络、DOM 或反调试代码。

旧网页 inline-26.decoded.js 的 `_0x49f4a8` 顺序执行操作，每步要求业务成功且 `data !== false`。任一步失败即停止。实现使用同一规则，失败、取消或过期后不重试、不切换后备动作。账号 token 与车辆编号在任何异步步骤前捕获，防止后续调用方状态变化将下一步发送到其它车辆。

## 云开关机 secret

inline-28.decoded.js 的 `_0x10f6b6`（偏移 61438–62364）将精确 JSON `{"lockFlag":1或0,"vinNo":"车辆编号"}` 编码为 UTF-8，按 PKCS7 填充，然后使用 AES-256-ECB 加密并 Base64 编码。密钥是包内固定常量的 32 个 ASCII 字节，不能按十六进制转为 16 字节。

WebCrypto 不提供 ECB。`legacy-unlock.ts` 沿用恢复网页的等价方法：对每个已填充分组，以全零 IV 单独调用 AES-CBC，只取第一个密文块。最终密文通过独立 Python cryptography 的 AES-ECB 生成六组 golden vectors 校验，覆盖两个开关值、17/15 位合成编号和明文恰好完整分组时额外增加的填充分组。该加密仅用于旧协议兼容，不是新设计的密钥保护方案。

## 自动检查与实车边界

新增 20 项单元检查：三个动作逐请求对照独立恢复契约；各步骤返回否定结果即停止；网络故障不重试；登录过期传播；发送前、准备后、控制请求中和加密期间取消；调用方状态变更后仍保持原始绑定；15 位编号端到端绑定；非法或缺失绑定不得发请求。本模块 TypeScript 检查无诊断，完整工程检查由本批集成统一执行。

检查只使用合成账号、编号和 fetch 模拟，没有发送真实短信、账号或车辆请求，没有读取流量数据库。新端点的部署来源跨域、车型支持和实车执行仍由本批正式发布后的集中验收确认。进度事件只包含步骤状态及脱敏协议错误码，不包含 secret、token、UID、VIN、原始请求或响应。
