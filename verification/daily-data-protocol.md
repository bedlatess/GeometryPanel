# 日常用车数据整理依据

本批只静态读取已授权的 1.8.12 发布脚本；未运行旧脚本，未连接真实账号、发送短信或车辆命令。以下描述恢复的是旧客户端的数据契约，不能代替服务端或实车验收。自动测试全部使用合成数据。

## 输入与输出

`dailySnapshot(home, battery, now?)` 接收 API 已解包的 `data` 对象；电池接口失败时 `battery` 为 `null`。输出 `DailyDetails`，不保留 token、VIN、手机号或原始响应。

主要依据是工作区 `analysis/zeehowebnext-1.8.12/web-published/inline-12.decoded.js`：

| 输出 | 原始字段 | 静态依据 |
| --- | --- | --- |
| 总里程 | `home.totalRideMile` | `_0x2457d7`，约 2287 行 |
| 本月里程 | `home.rideMileageMonth` | 同上 |
| 本月时长，分钟 | `home.ridingTimeMonthUnitMinute` | 同上 |
| 本月均速 | `home.avgVelocityMonth` | 同上 |
| 电流 | `battery.current`；缺失回退 `home.current` | 电池 `_0x4c83f0`，约 2538 行；首页约 2318 行 |
| 功率 | `battery.power`；首页 `home.batteryPower` | 同上；`_0x39a1db`，约 2511 行 |
| 温度 | `battery.batteryTemp`；缺失或异常回退 `home.batteryTemp` | 首页约 2231 行，电池约 2571 行 |
| 车机上报 SOH | `battery.soh` | 电池约 2564 行；只接收 0–100 范围，不把它称为本项目测得的容量健康度 |
| 车机循环次数 | `battery.chargeCount` | 电池约 2567 行；只接收非负整数 |
| 龙头锁 | `home.headLockState` | 首页约 2240 行 |
| 座锁 | `home.seatLockState` | 首页约 2243 行 |
| 车锁 | `home.iotProperties[]` 中 `identify === 'VehicleLock_S'` 的 `value` | 首页约 2202–2242 行；与旧版一样以最后一条同名属性为准 |
| 原始车辆状态 | `home.rideState` | 首页约 2258 行；只保留代码，不臆造上下电语义 |
| 充电已用时 | `home.chargeTimeString` | `_0x2c2921`，约 2046–2075 行 |
| 预计充满描述 | `home.expectFullTimeDescribe` | 同上 |
| 车辆上报时间 | `home.refreshTime` | 首页约 2260 行 |
| 电池上报时间 | `battery.refreshTime` | 电池约 2572 行 |

单位交叉证据：`inline-28.decoded.js` 字符偏移约 117366 将总里程显示为 `km`；约 123639–123897 将月里程显示为 `km`、均速显示为 `km/h`，月时长传给 `minutesShort`。电流、功率只使用原始量纲 A、W 或同一响应的 `V × A`，不推断 Wh/kWh。`inline-22.decoded.js` 字符偏移约 284307 把 `chargeCount` 标为“车机循环次数 / 次”，注明“与等效满充口径不同”，因此不承诺它等于实际插枪次数。

## 能力与状态分开

| `capabilities` 字段 | 原始字段 |
| --- | --- |
| `networkUnlock` | `supportNetworkUnlock` |
| `unlock` | `supportUnlock` |
| `search` | 尚无独立的支持字段证据，始终保留 `null` |
| `seatOpen` | `openCushionFlag` |
| `storageOpen` | `openStorageBoxFlag` |

首页模型约 2249–2254 行映射上述原始字段。`inline-26.decoded.js` 字符偏移约 153407、153480 把 `cushionOpen`、`storageOpen` 显示为“可开启”，而座锁状态独立使用 `seatLock`。因此 `openCushionFlag` 是旧版开启能力提示，不作为座垫当前是否打开的传感器读数。

**寻车的旧 UI 描述存在歧义，不能照抄其支持判断。** `inline-12` 字符偏移约 105819 的功能元数据明确：`LOUDLY_SEARCH_CAR = { t: '寻车鸣笛', kind: 'switch', key: 'loudlySearchCar', from: 'home' }`。它是当前鸣笛设置。尽管旧模型把它叫 `canSearch`，旧动作说明把它显示为“支持/不支持”，这些都不能证明它是普通或高声寻车的能力。本批不接这个设置开关，`capabilities.search` 保留未知，不因 `loudlySearchCar=false` 禁用已经实车通过的普通寻车。

`supportNetworkUnlock`、`supportUnlock` 分别由旧模型命名为 `canNetUnlock`、`canUnlock`；扫描全部恢复的发布脚本后，未发现旧 UI 对两个字段进行联合或独立 gating 的消费证据。因此保留两个独立的显式 support 标志，不假设二者必须同时为真。网络锁动作只采用明确的 `networkUnlock=false` 作为不支持依据，`unlock` 不用于禁用此命令。具体车型仍需要最终实车验收。

所有能力与锁状态均为 `boolean | null`：只识别明确的 `1/0`、`true/false`、`yes/no`、`y/n`，缺失、空白、其他代码保留未知。不能因为没有字段就说车辆不支持，也不能把未知锁状态写成“已关锁”。

## 位置与坐标系

首页模型约 2199、2262–2276 行读取 `home.location.longitude/latitude/altitude/coordinateSystem/locationTime`。地址优先级是 `home.address`、`location.address`、`location.addressName`。新模型拒绝非数字、越界坐标以及 `(0,0)`；单独一轴为 0 仍有效。

旧版首页只透传 `coordinateSystem`，地图没有读取这个值。`inline-18.decoded.js` 中 `_0x2e87b8`（字符偏移约 178495）把收到的位置直接当作 GCJ-02；仅当地图图源标记为 WGS84 时调用 `MODEL.gcj02ToWgs84`。轨迹地图约 182800 也使用同一输入契约。转换函数在 `inline-12` 约 2078–2174 行，导出在约 4501 行。`inline-28` 约 139292 则把浏览器地理定位的 WGS84 转成 GCJ-02 后参与旧地图。这些是旧客户端对输入坐标的明确约定，尚未经过本轮服务端实测。

为兼容原项目，缺失、`null` 或空白 `coordinateSystem` 使用 `gcj02`，并标注 `coordinateSystemSource: 'legacy-default'`，不能声称是服务器明确报告。明确 `GCJ-02/gcj02` 或 `WGS-84/wgs84` 归一化，标注 `reported`；其他显式值（包括 BD-09）保留 `unknown`，调用方应禁用需要已知坐标系的导航。模型不做坐标转换，导航适配由调用方处理。

## 时间与过期提示

`receivedAt` 是浏览器接收/整理响应的时间；`reportedAt`、`batteryReportedAt`、`location.reportedAt` 都来自对应设备报告字段。接口请求成功不代表车辆刚刚上报。三组报告时间分别计算状态，缺失时为 `unknown`。

- `DAILY_STALE_AFTER_MS = 30 分钟`：超过该年龄标为 `stale`；旧版 `_0x28d4f2` 在约 1418 行同样是 30 分钟。
- `DAILY_FUTURE_TOLERANCE_MS = 5 分钟`：比当前时间超前超过此容差标为 `future`，不显示为刚刚更新。容差是本项目的时钟偏差处理策略。
- 接受 Unix 秒（10 位）、毫秒（12–13 位）及带时区日期；没有时区的完整云端日期按中国标准时间 `+08:00` 解析，避免 iPhone 时区与 Safari 字符串解析差异。
- 校验真实日历，拒绝 2 月 30 日、24 点、空值、零时间戳等。无年份或仅日期不猜测为本年度/当天；不能归一化的上报时间保留未知。

旧版日期解析 `_0x5407b6` 在约 1370–1416 行；旧版还会猜测缺失年份并允许宿主自行解析。本项目不继承这些可能误报新鲜度的行为。

## 数值与充电语义

数值只接受有限数字或纯数字字符串；布尔值、数组、对象、空白、NaN、Infinity 不转成读数。有效 0 和负电流/负功率保留。里程、时长、均速、计数不得为负；温度只接受 -100–200°C 这一宽松显示边界（过滤明显无效的 255 等，不代表电池安全工作范围）。健康 SOH 只接受 0–100。

电池读数优先，字段不可用时回退首页。缺少电流可用同一响应 `power / voltage` 推导至 0.1 A；缺少功率可用同一响应 `voltage × current` 推导为整数 W；不会把不同响应的电压、电流或功率混算。已明确上报的 0 和有效电流不因计算结果不同而被重写。旧版 `_0x211f5b` 会在偏差超过 20% 时改写电流，本项目保留实际收到的字段，避免把计算值冒充上报值。

`1h 30min` 等格式表示**充电已用时**，归一化成 90 分钟与中文描述。明确 `0min` 保留为 0 分钟；未知格式仅显示原始描述、不硬算分钟。`expectFullTimeDescribe` 独立显示预计描述。`fullChargeTime` 单位尚不明确，本批不把它当成剩余分钟。`batteryLevel`、`powerUseToday/powerUseMonth/powerChargeMonth` 的单位也未确认，本批不添加虚构单位。

## 自动验证

命令：`npx tsx --test src/core/daily-model.test.ts`，15 项通过。覆盖真实字段名、接口部分失败、有效零值/负数、异常输入、能力未知与明确否定、鸣笛设置不会禁用寻车、锁状态、充电已用时、日期跨浏览器解析、过期/未来时间、地址优先级、坐标边界与坐标系来源。

这些结果验证纯数据处理，不代表真实接口、iPhone Safari 或车辆行为已经验收。整批构建、浏览器模拟检查和最终真实设备验收由主任务统一记录。
