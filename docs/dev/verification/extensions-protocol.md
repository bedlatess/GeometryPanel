# 网页扩展：协议依据与接入边界

本批接入骑行记录、历史轨迹、胎压、车辆告警和车辆设置。只读取已有授权拆解材料，未运行旧发布脚本，未读取 traffic DB，未使用真实账号、发送短信或车辆命令。浏览器验证全部为合成数据，不能称为真实 iPhone 或实车验收。

## 集成接口

`mountExtensions(host: HTMLElement, { session: Session | null, demo: boolean, onExpired: () => void, onUncertain?: () => void }): () => void`，位于 `src/ui/extensions.ts`。父页面把它放进自己的 dialog，关闭、换车、换账号时调用返回的销毁函数；销毁会取消请求、移除事件并清空面板内的数据。在写入过程中销毁会回调 `onUncertain`，由父页面保留结果未确认提示；取消本地等待不等于车辆没有执行。

- 默认读取当前中国月份的骑行记录；每类独立按需读取，可选择月份/日期及翻页。失败不会被显示成“没有记录”。
- 查询期和数据绑定，不继续展示上一月份/日期的结果。过期认证清空面板并停止后续操作，再通知父页面进入重新登录流程。
- 设置先选择目标，再显示车型与当前值/目标值确认；演示模式和未识别/禁用项目不能提交。发送失败不自动重试，也不改成本地假成功。受理后重新读取，车辆实际状态可能有延迟。
- 演示在页面顶部标明合成数据；所有数据来自本机固定样例，不请求上游、不打开真实地图、不发送写入。

## 读取协议

基址均为现有客户端的 `https://tapi.zeehoev.com`，方法 GET。表内路径前缀 `APP` 为 `/v1.0/app/cfmotoserverapp`。

| 功能 | 路径与查询 | 原始发布物证据 |
| --- | --- | --- |
| 月度骑行 | `APP/myRideInfo`；`month=YYYY.MM, vinNo` | `inline-10.decoded.js` 1253–1258 行 |
| 当天历史轨迹 | `APP/ridetrack_v2`；`page,pageSize=20,startDateTime=YYYY-MM-DD,startTime=YYYY-MM,vinNo`；`startDate/endDate` 空值不出现在签名或 URL | `inline-10` 1260–1273 行 |
| 实时胎压 | `APP/app/vehicle/tire/monitoring`；`sensorType=EXTERNAL,vinNo` | `inline-10` 1203–1209 行；原生 `VEHICLE_API.md` 也有独立交叉依据 |
| 车辆消息 | `/v1.0/mine/cfmotoservermine/app/Message/list_v2`；`messageKind=3,page,pageSize=20,userId` | `inline-10` 1146–1158 行 |
| 设置能力 | `APP/vehicleSet/items`；`homepageInvoke=1,vinNo` | `inline-10` 1232–1238 行 |
| 设置当前值 | `APP/vehicleSet/vehicleSetInfo/{VIN}` | `inline-10` 1240–1245 行 |

日期做日历校验，页码限 1–500；不使用错误日期拼接新查询。没有拿 `analyse` 的月统计或示例估算补齐缺失日记录。

## 数据字段与表现

`inline-12.decoded.js` 为主要恢复依据：

- 骑行：约 2600–2620、2662–2724 行；`rideRecordList[].date/rideMileage/ridingTimeDayUnitMinute/maxSpeed`，总额 `rideMileageTotal`。里程 km、分钟、km/h；缺测保留未知，明确 0 保留。总额不自行宣称为当月合计，页面写“账号返回的累计骑行里程”。
- 轨迹：约 2725–2789 行；外层数组的 `historyList[]`，使用 `rideId/dayTime/startTime/endTime/rideMileage/ridingTimeUnitMinute/maxSpeed`；地址来自 `startAddr/endAddr` JSON 内的 `name/address`；轨迹是 `trajectory` 的 `longitude,latitude,...&...` 点列。
- 本地 SVG 只画实际点列的轨迹形状，明确不含道路底图。非法点形成断段，不补直线穿过缺失位置。单条轨迹最多处理 20000 个字符串采样；无点不冒充有效地图。起终点地图入口在用户点击后才打开，按已恢复旧地图的 GCJ-02 输入约定处理，不自动加载外部图源。没有使用未验证的速度/距离采样单位推导新里程。
- 胎压：约 1908–1962、2400–2443 行；`realTimeData[]` 中 `sensorPosition=1/2` 明确对应前/后轮，使用 `tirePressure/tireTemp/warningType/reportTime`；汇总时间 `updateTime`。同轮重复数据选择较新报告。单位在 `inline-28` 字符偏移约 133433、134216 的旧 UI 明确为 bar/℃。设备代码大于 0 提醒检查，不臆造每个告警代码含义，也不把旧应用的用户阈值当成车型安全胎压。
- 告警：约 4413–4476 行；`messageVOList[]` 使用 `messageId/content/messageTime/messageTimeStr/unread/extra`；`unread="0"` 是未读。`extra` 内可含 `detail/address/vinNo/carInfo`，均按文本展示并转义，远程 HTML、缩略图、URL 不自动加载。已知 VIN 的其他车辆消息不显示；无 VIN 消息标明是未注明车辆的账号消息。`noRead` 是账号级数量，不冒称为当前车辆的未读总数。本批不自动标为已读、不删除消息。
- 上报时间与当前读取时间分开。胎压缺少报告时间明确写未知，超过 30 分钟写数据较早，超前超过 5 分钟写时间异常，沿用日常数据模块的阈值。

## 查询签名兼容

旧 `inline-12` 9318–9360 行的 `_0x554119/_0x40d373` 先按键排序、跳过空值，拼接未编码的 `k=v&...`，再与 body 及原有签名参数拼接。`src/api/sign.ts` 已实现此算法，本次只让 `CloudClient` 把经过校验的 query 同时加入签名和 URL。

恢复的这些参数均为 ASCII ID、日期或数字。客户端限键为字母数字/下划线，值为有界字母数字及 `_ . : -`，拒绝空格、`+ & = ? #`、数组和其他对象，防止签名文本与 URL 解码结果不一致。不会让调用方把任意查询直接塞进 path。无 query 的原登录、车况和车控请求保留原字节及签名行为，其现有测试仍运行。

## 车辆设置写入

23 个普通设置加7个扩展设置使用旧 `_0x3387fd`（约 3400–3609 行）、`_0x3c3a28`（3610–3635 行）与元数据枚举。`verification/extensions-contract.json` 由 TypeScript AST 只解析旧文件的字面量生成，包含其源文件 SHA-256；未 eval、未运行旧 JS。测试独立对照该账本验证全部30项的键、枚举、端点、请求字段、命令码和版本。

| 设置 | propertyOne `commond`；版本 |
| --- | --- |
| 精准续航 / 低电量长续航 | 55 / 72；空字符串 |
| 动能回收 / 定速巡航 / 电子制动 / eTCS | 62 / 64 / 57 / 59；v2 |
| BSD / 自动驻车 / 震动报警 | 81 / 51 / 61；v2 |
| 密码解锁 / NFC | 74 / 90；v2 |
| 紧急制动提示 / 离车关机 / 超时关机保护 | 107 / 32 / 103；v2 |
| 边撑感应 / 伴我回家 / 伴我回家时长 | 73 / 56 / 58；v2 |
| 里程单位 / 温度单位 / 时间格式 / 超时关机时间 | 2 / 3 / 5 / 108；v2 |

以上是 PUT `APP/vehicleSet/propertyOne/one`，body 精确为 `commond,commondParam,relatedFunctions:null,vcu,version`，不把 `commond` 改成别的拼写。车机音量 PUT `APP/vehicleSet/soundSize`，`{size,vcu}`，只开放恢复的 0–100 每十档枚举；投屏开关 PUT `APP/vehicleSet/motoPlay/one`，`{vinNo,motoPlay:0|1}`。端点方法依据 `inline-10` 1420–1445 行。

当前值须能匹配已恢复枚举才开放修改；显式 `isSupport=false`、对应 `disabledContent` 原因、仅提供蓝牙服务的能力项均保留限制。其他未知能力仅展示名称与未适配说明。

### 0.5.0 扩展设置与原版自身限制

- 感应距离command54，1/3/5；离车关机时长command33，3/5/10/30/60/120/180秒；RCW后碰撞command82，0/1/2；均v2。RCW保留AE5排除，以及RADAR_RCW显式支持或RADAR_BLIND_MONITOR子服务RADAR_RCW且isSupportSetting非false的条件，不能凭存在radarRcw字段就写。
- 座垫感应command66、v2、0/1，按 `rideFunctionVOList` 中parentCode=E_CUSHION_SENSOR/functionCode="2.0"选择ecushionSensor，否则cushionSensor。依据inline12:3900起。每次提交前重读能力与设置，拒绝已变化的代际、禁用状态或未知当前值。
- 单击自定义按键command142、v2，枚举31无操作、1 Hello音效、19陡坡缓降设置、3解锁座垫。依据inline12:2889–2894的 `_0x576c8a`、2982起CUSTOM_KEY_SET与写映射。保留 `relatedFunctions:null`，不推演成多键合并请求。
- 低电量阈值PUT `APP/vehicleSet/lowPowerRule/one`，body精确 `{ruleId:"",value:String(value),vcu}`，10..50每5档，依据inline12:3178起元数据、3607写映射与3624构造器。
- **最高车速只读是旧版自身限制**：inline12:2896–2908，MAXIMUM_SPEED为kind="value"，主字段maximumSpeedLimit，子字段maximumSpeed/topSpeed；obs原文“71到底改的是哪个设置还没定案，所以先不给写”。完整写映射没有这几项。不能把一次官方App观察到的command71/param1移植成任意km/h写入。
- **多种复杂按键旧版本身未适配**：inline12:3992起 `_0x527375` 找CUSTOM_KEY_SET后直接删除subs，并注明“单键动作可改；长按/左键/右键/组合键暂未适配”。当前这些字段显示只读，单击142已迁移，不宣称原版也支持完整多键改写。

### 车辆感应钥匙云开关

这是30个静态写合同之外的独立设置，调用主任务提供的 `NativeMaterialsApi.configureInductive`，不使用 propertyOne。依据原生 `jadx/sources/defpackage/y6.java` 的 `B(boolean)` 约 228–266 行、`t5.c(3)` 与 `b6.h`：POST `APP/app/inductiveUnlock/airLock/setting`，body 为 `{inductiveUnlockType:"",openStatus:0|1,uniqueIdentify:"",vinNo}`。

修改前由该服务核对账号、车辆与车主绑定；修改后重新读取 settings，先看 `inductiveUnlocking2`，无明确值才看 `inductiveUnlocking`。面板再刷新设置，并根据 confirmed 与刷新值提示已核实或尚未确认。设备注册的 `/airLock/save` 使用 `inductiveUnlockType:"2.0"` 和设备 identity，二者不能混用。网页云开关不意味着 Safari 具备后台蓝牙感应能力。

## 0.5.0 消息管理与道路底图

消息read/delete均沿旧接口默认GET，固定query messageKind="3"。来源inline10:1171/1178端点目录、inline16:3844默认GET，以及inline28的msgread/msgclear调用。二者都是**账号全部车辆消息**，没有VIN参数；页面单独确认并明确包含未显示的其他车辆消息，不实现没有证据的单消息删除。仅打开消息页不会标已读；受理后重新读取，失败不自动重发。

道路底图沿inline18的 `_0x51d5a8.amap`：固定webrd01..04.is.autonavi.com/appmaptile，lang=zh_cn,size=1,scale=1,style=8，x/y/z按Web Mercator切片。使用与旧版轨迹相同的GCJ-02输入，不把WGS84瓦片直接盖上去。每条行程只有点击“加载道路底图”才联网取瓦片，演示禁用真实地图。道路与轨迹在同一投影/缩放下绘制，断点不补线；加载失败明确提示，保留轨迹和起终点地图入口。地图署名保留©高德地图，不缓存车辆轨迹或远程瓦片为PWA离线发布物。

## 验证

- `src/api/extensions.test.ts`、`src/core/extensions-model.test.ts`：20 项合成数据单测通过，覆盖读取契约、query 签名/校验、23 项设置独立静态账本、失效认证、取消、异常数字、轨迹断段、车辆消息隔离和设置限制。
- `npx tsc --noEmit` 与 `npm run build` 通过；完整 `npm test` 曾通过 103 项，后续感应开关与静态账本测试由主任务最后统一复跑。
- `tests/extensions.spec.ts` 的 8 类流程在系统 Chrome 与 Playwright WebKit 共 16 项分别通过：月份/日期查询、轨迹、胎压/告警、确认与取消、设置读后核实、写入失败不重试、关闭取消、演示禁写、感应云开关、认证失效及写入中关闭的未知结果提示。最后 2 项在父页面接上 `onUncertain` 后重建再测通过。使用测试夹具的请求前 fetch 替换与本地主机 CSP，不连接真实上游；主任务发布前再统一执行完整回归。

未静态确认：当前服务端是否继续提供每个端点、跨域响应、账号/车型能力完整性、消息实时性与车辆执行时机。真实车辆不支持某项时保留服务器错误或能力说明，不按模拟结果承诺实车通过。

0.5.0新增独立账本已扩至30个写合同；API测试覆盖复杂设置提交前的代际/能力复读和账号级消息精确GET。轨迹几何单测覆盖同系瓦片、缩放和断点。扩展与任务两套浏览器合计32项（Chrome/WebKit）已通过，瓦片全部stub、API全部前置模拟。另补复杂单击写入/座垫代际变化阻断场景，交主任务最终全量回归执行。旧版自身只读限速和未适配多键保留精确证据，不作为已经恢复的写入能力。
