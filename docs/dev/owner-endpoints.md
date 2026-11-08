# 0.8.0 新增接口查证

这些是静态拆解证据，不代表服务端、账号或实车已经验证。编码前核对了 `owner-api-contracts.json` 的声明以及对应 Java 声明、DTO 和调用链。完整拆解文件保留在工作区 `analysis/`，不随网页发布。

## 服务前缀

`AppConfig.java:128–132` 与 `ApiManager.java:66,101` 确认：IHmService 使用 `/v1.0/app/cfmotoserverapp/`，IPsService 使用 `/v1.0/mine/cfmotoservermine/`。请求签名和登录头沿用 CloudClient。

| 方法 | 完整路径 | 参数 | 返回模型 | 证据文件及行 |
|---|---|---|---|---|
| GET | `/v1.0/app/cfmotoserverapp/analyse/analyse` | Query month, Query vinNo | `DriveAnalyseRsp` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:167` |
| GET | `/v1.0/app/cfmotoserverapp/batteryChargings` | Query month, Query vinNo | `BatteryChargeRsp` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:173` |
| GET | `/v1.0/app/cfmotoserverapp/batteryUsings` | Query month, Query vinNo | `BatteryUseRsp` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:176` |
| DELETE | `/v1.0/app/cfmotoserverapp/carShare/{vinNo}` | Path vinNo, Query sharedUserId | `Boolean` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:194` |
| PUT | `/v1.0/app/cfmotoserverapp/vehicle/tempShare` | Body TemShareCarReq | `ShareCarReq` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:197` |
| PUT | `/v1.0/app/cfmotoserverapp/chargePlan/one` | Body CreatePlanReq | `String` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:203` |
| PUT | `/v1.0/app/cfmotoserverapp/chargePlan/one/use` | Body PlanUseReq | `Boolean` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:206` |
| POST | `/v1.0/app/cfmotoserverapp/electricFence/one` | Body CreateFenceReq | `Boolean` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:224` |
| POST | `/v1.0/app/cfmotoserverapp/chargePlan/one` | Body CreatePlanReq | `String` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:227` |
| DELETE | `/v1.0/app/cfmotoserverapp/electricFence/one` | Query id | `Boolean` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:230` |
| DELETE | `/v1.0/app/cfmotoserverapp/app/inductiveUnlock/airLock/remove/{id}` | Path id | `Boolean` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:233` |
| DELETE | `/v1.0/app/cfmotoserverapp/vehicle/tempShare` | Body ArrayList | `String` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:242` |
| GET | `/v1.0/app/cfmotoserverapp/vehicle/abnormal/{vinNo}` | Path vinNo | `MotoExaRsp` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:254` |
| GET | `/v1.0/app/cfmotoserverapp/batteryInfo/detail/{vinNo}` | Path vinNo | `BatteryDetailRsp` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:263` |
| GET | `/v1.0/app/cfmotoserverapp/batteryAnalyse` | Query vinNo, Query month | `BatteryScoreRsp` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:269` |
| GET | `/v1.0/app/cfmotoserverapp/chargePlan/list/{vinNo}` | Path vinNo | `List<ChargePlanRsp` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:281` |
| GET | `/v1.0/app/cfmotoserverapp/electricFence/list/{vinNo}` | Path vinNo | `List<FenceRsp` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:293` |
| GET | `/v1.0/app/cfmotoserverapp/keepmileage/{vinNo}` | Path vinNo | `KeepMileageResp` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:317` |
| GET | `/v1.0/app/cfmotoserverapp/vehicleSet/nfc/list` | Query vinNo | `ArrayList<NfcListItemRsp` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:332` |
| GET | `/v1.0/app/cfmotoserverapp/app/inductiveUnlock/airLock/list` | Query vinNo | `ArrayList<PairedDeviceRsp` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:350` |
| GET | `/v1.0/app/cfmotoserverapp/app/service/recharge/vehicle/detail` | Query vinNo | `CarRechargeListRsp$CarRechargeRsp` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:359` |
| GET | `/v1.0/app/cfmotoserverapp/getRechargeEndDate` | Query frameNo | `RechargeServiceTimeBean` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:365` |
| GET | `/v1.0/app/cfmotoserverapp/carShare/{vinNo}` | Path vinNo | `List<ShareCarReq` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:377` |
| GET | `/v1.0/app/cfmotoserverapp/vehicle/tempShare/timeOpts` |  | `List<TimeOptsResp` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:380` |
| GET | `/v1.0/app/cfmotoserverapp/aggregate/vehicle/{vcu}` | Path vcu | `SimDataRsp` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:383` |
| GET | `/v1.0/app/cfmotoserverapp/vehicle/tempShare/list` | Query vinNo | `List<ShareCarReq` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:395` |
| POST | `/v1.0/app/cfmotoserverapp/vehicleSet/lowPowerPhoneReminder` | Body BattrtyLowPowerReq | `Boolean` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:461` |
| POST | `/v1.0/app/cfmotoserverapp/vehicleSet/lowPowerPhoneReminder` | Body lowPowerPhoneReq | `Boolean` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:461` |
| POST | `/v1.0/app/cfmotoserverapp/vehicleSet/nfc/rename` | Body NfcRenameReq | `Boolean` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:473` |
| GET | `/v1.0/app/cfmotoserverapp/redPoint` | Query vinNo | `Integer` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:500` |
| GET | `/v1.0/app/cfmotoserverapp/otaDetail` | Query id, Query vinNo | `OtaUpRsp` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:509` |
| GET | `/v1.0/app/cfmotoserverapp/otaRecord` | Query vinNo | `List<OtaListItemRsp` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:518` |
| GET | `/v1.0/app/cfmotoserverapp/upstatus` | Query vinNo | `OtaUpstatus` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:521` |
| GET | `/v1.0/app/cfmotoserverapp/ota/list` | Query vinNo | `ArrayList<OTATaskBean` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:524` |
| POST | `/v1.0/app/cfmotoserverapp/vehicle/tempShare` | Body TemShareCarReq | `ShareCarReq` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:545` |
| GET | `/v1.0/app/cfmotoserverapp/app/inductiveUnlock/ble/status` | Query vinNo | `BleStatusVO` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:552` |
| GET | `/v1.0/app/cfmotoserverapp/ota/redPointType` | Query vinNo | `Integer` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:573` |
| POST | `/v1.0/app/cfmotoserverapp/keepmileage/reset` | Body ResetKeepmileageReq | `Boolean` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:576` |
| GET | `/v1.0/app/cfmotoserverapp/rideDayInfo` | Query vinNo, Query date | `RideDayInfoRsp` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:579` |
| POST | `/v1.0/app/cfmotoserverapp/carShare` | Body ShareCarReq | `Boolean` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:628` |
| PUT | `/v1.0/app/cfmotoserverapp/electricFence/one` | Body CreateFenceReq | `Boolean` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:640` |
| PUT | `/v1.0/app/cfmotoserverapp/electricFence/one/use` | Body FenceUseReq | `Boolean` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IHmService.java:643` |
| GET | `/v1.0/mine/cfmotoservermine/app/Message/allUnRead` |  | `Integer` | `analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/network/service/IPsService.java:118` |

## 请求体与返回字段

表中的行号均为工作区解包 Java 文件的行号。字段可以缺失；页面不补造值。

### BattrtyLowPowerReq

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/reqest/BattrtyLowPowerReq.java`

- `11`: `private final int lowPowerPhoneReminder;`
- `12`: `private final String lowPowerPhoneReminderEndTime;`
- `13`: `private final String lowPowerPhoneReminderStartTime;`
- `14`: `private final String vinNo;`

### CreateFenceReq

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/reqest/CreateFenceReq.java`

- `5`: `private String addrPosition;`
- `6`: `private String addrPositionName;`
- `7`: `private String id;`
- `8`: `private String radius;`
- `9`: `private String rideRangeName;`
- `10`: `private String rideRangeRule;`
- `11`: `private String scalingRatio;`
- `12`: `private String vinNo;`

### CreatePlanReq

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/reqest/CreatePlanReq.java`

- `5`: `private String endTime;`
- `6`: `private String id;`
- `7`: `private String startTime;`
- `8`: `private String vinNo;`

### FenceUseReq

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/reqest/FenceUseReq.java`

- `5`: `private String delFlag;`
- `6`: `private String id;`

### NfcRenameReq

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/reqest/NfcRenameReq.java`

- `11`: `private String nfcId;`
- `12`: `private String nfcName;`
- `13`: `private String vinNo;`

### PlanUseReq

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/reqest/PlanUseReq.java`

- `5`: `private String delFlag;`
- `6`: `private String id;`
- `7`: `private String vinNo;`

### ResetKeepmileageReq

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/reqest/ResetKeepmileageReq.java`

- `5`: `public String vcu;`

### ShareCarReq

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/reqest/ShareCarReq.java`

- `8`: `private String abnormalRideRule;`
- `9`: `private String abnormalRideStatus;`
- `10`: `private String addrPosition;`
- `11`: `private String beforeSetUserFlag;`
- `12`: `private String carUserId;`
- `13`: `private String eco;`
- `14`: `private String endTime;`
- `15`: `private String endTimestamp;`
- `16`: `private String id;`
- `17`: `private String isOrNotContinue;`
- `18`: `private String naturalMode;`
- `19`: `private String radius;`
- `20`: `private Boolean registered;`
- `21`: `private int residualSeconds;`
- `22`: `private String rideRangeName;`
- `23`: `private String rideRangeRule;`
- `24`: `private String rideRangeStatus;`
- `25`: `private String rideTimeFrom;`
- `26`: `private String rideTimeTo;`
- `27`: `private BigDecimal scalingRatio;`
- `28`: `private int shareHours;`
- `29`: `private String shareName;`
- `30`: `private String sharePhone;`
- `31`: `private String shareUserId;`
- `32`: `private String sport;`
- `33`: `private String userAvatar;`
- `34`: `private String userName;`
- `35`: `private String userPhone;`
- `36`: `private String vehicleName;`
- `37`: `private String vinNo;`

### TemShareCarReq

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/reqest/TemShareCarReq.java`

- `7`: `private String fullName;`
- `8`: `private String id;`
- `9`: `private String phone;`
- `10`: `private int shareHours;`
- `11`: `private String vinNo;`

### TimeOptsResp

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/reqest/TimeOptsResp.java`

- `7`: `private int count;`
- `8`: `private int hours;`
- `9`: `private String unit;`

### lowPowerPhoneReq

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/reqest/lowPowerPhoneReq.java`

- `10`: `private Integer lowPowerPhoneReminder;`
- `11`: `private String lowPowerPhoneReminderEndTime;`
- `12`: `private String lowPowerPhoneReminderStartTime;`
- `13`: `private String vinNo;`

### BatteryChargeRsp

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/response/BatteryChargeRsp.java`

- `7`: `private List<BatteryChargeRsp$ChargeListBean> chargeList;`
- `8`: `private String powerChargeMonth;`
- `9`: `private String powerChargeToday;`

### BatteryDetailRsp

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/response/BatteryDetailRsp.java`

- `5`: `private String bmsCurrent;`
- `6`: `private String bmsVoltage;`
- `7`: `private String chargeState;`
- `8`: `private String fullChargeTime;`
- `9`: `private String fullChargeTimeUnitMinute;`
- `10`: `private String power;`

### BatteryScoreRsp

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/response/BatteryScoreRsp.java`

- `7`: `private List<BatteryScoreRsp$BatteryDeductListBean> batteryDeductList;`
- `8`: `private String comment;`
- `9`: `private String month;`
- `10`: `private String score;`

### BatteryUseRsp

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/response/BatteryUseRsp.java`

- `7`: `private String powerUseMonth;`
- `8`: `private String powerUseToday;`
- `9`: `private List<BatteryUseRsp$UseListBean> useList;`

### BleStatusVO

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/response/BleStatusVO.java`

- `10`: `public int btMacEnable;`
- `11`: `public int hmiBleMacEnable;`

### CarRechargeListRsp$CarRechargeRsp

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/response/CarRechargeListRsp$CarRechargeRsp.java`

- `5`: `private boolean isSelected = false;`
- `6`: `private int lastUseDate;`
- `7`: `private String rechargeEndDate;`
- `8`: `private String rechargeEndTime;`
- `9`: `private String serviceRechargeStatus;`
- `10`: `private String vehicleName;`
- `11`: `private String vehiclePicUrl;`
- `12`: `private String vinNo;`

### ChargePlanRsp

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/response/ChargePlanRsp.java`

- `5`: `private String delFlag;`
- `6`: `private String endTime;`
- `7`: `private String id;`
- `8`: `private String startTime;`
- `9`: `private String userId;`
- `10`: `private String vinNo;`

### DriveAnalyseRsp

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/response/DriveAnalyseRsp.java`

- `5`: `private String accelerationTimes;`
- `6`: `private String accelerationTimesPercent;`
- `7`: `private String bendingTimes;`
- `8`: `private String bendingTimesPercent;`
- `9`: `private String brakesTimes;`
- `10`: `private String brakesTimesPercent;`
- `11`: `private String extremeSpeedNumber;`
- `12`: `private String extremeSpeedNumberPercent;`
- `13`: `private String longDrive;`
- `14`: `private String maxSpeed;`
- `15`: `private String maxSpeedPercent;`
- `16`: `private String nightRide;`
- `17`: `private String offLight;`
- `18`: `private String offTurnLight;`
- `19`: `private String rideMileage;`
- `20`: `private String rideMileagePercent;`
- `21`: `private String ridingTime;`
- `22`: `private String ridingTimePercent;`
- `23`: `private String ridingTimeUnitMinute;`

### FenceRsp

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/response/FenceRsp.java`

- `7`: `private String addrPosition;`
- `8`: `private String addrPositionName;`
- `9`: `private String delFlag;`
- `10`: `private String id;`
- `11`: `private boolean isLoading;`
- `12`: `private String radius;`
- `13`: `private String rideRangeName;`
- `14`: `private String rideRangeRule;`
- `15`: `private String scalingRatio;`
- `16`: `private String userId;`
- `17`: `private String vinNo;`

### KeepMileageResp

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/response/KeepMileageResp.java`

- `11`: `private String keepMileage;`
- `12`: `private String vinNo;`

### MotoExaRsp

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/response/MotoExaRsp.java`

- `8`: `private int deductScore;`
- `9`: `private int heteroconstant;`
- `10`: `private List<MotoExaRsp$SystemBean> systemList;`

### NfcListItemRsp

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/response/NfcListItemRsp.java`

- `11`: `private final String createDate;`
- `12`: `private final String id;`
- `13`: `private String nfcName;`
- `14`: `private String nfcNo;`

### PairedDeviceRsp

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/response/PairedDeviceRsp.java`

- `11`: `private ArrayList<PairedDeviceRsp> inductiveUnlockVOList;`
- `12`: `private String carOwnerFlag = "";`
- `13`: `private String deviceFlag = "";`
- `14`: `private String id = "";`
- `15`: `private String ipAddress = "";`
- `16`: `private String modifyTime = "";`
- `17`: `private String parseAddress = "";`
- `18`: `private String phoneName = "";`
- `19`: `private String uniqueIdentify = "";`
- `20`: `private String vinNo = "";`
- `21`: `private String userNickname = "";`
- `22`: `private String relationType = "";`

### RideDayInfoRsp

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/response/RideDayInfoRsp.java`

- `5`: `private String accelerationTimesDay;`
- `6`: `private String bendingTimesDay;`
- `7`: `private String brakesTimesDay;`
- `8`: `private String greenContributionDay;`
- `9`: `private String maxSpeed;`
- `10`: `private String powerConsumptionDay;`
- `11`: `private String rideMileageDay;`
- `12`: `private String ridingTimeDay;`
- `13`: `private String ridingTimeDayUnitMinute;`

### SimDataRsp

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/response/SimDataRsp.java`

- `7`: `private List<SimDataRsp$AggregateBean> aggregate;`
- `8`: `private int lastUseDate;`
- `9`: `private String simStatus;`
- `10`: `private String vinNo;`

### OtaListItemRsp

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/response/ota/OtaListItemRsp.java`

- `5`: `private String id;`
- `6`: `private String otaVersion;`
- `7`: `private String updateDate;`
- `8`: `private String upgradeStatus;`

### OtaUpRsp

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/response/ota/OtaUpRsp.java`

- `10`: `private String estimatedTimeDescribe;`
- `11`: `private String lastlyVersion;`
- `12`: `private String nowVersion;`
- `13`: `private String updateDate;`
- `14`: `private final String vehiclePicUrl;`
- `15`: `private String vehicleType;`
- `16`: `private String versionDesc;`
- `17`: `private int upgradeStatus = -1;`
- `18`: `private String errDesc = "";`

### OtaUpstatus

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/bean/response/ota/OtaUpstatus.java`

- `10`: `public String errCode;`
- `13`: `public String errDesc;`
- `16`: `public int status;`

### OTATaskBean

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/ota/bean/OTATaskBean.java`

- `9`: `private final String iotTaskId;`
- `10`: `private final Integer isWifiTransmission;`
- `11`: `private final String otaDescContent;`
- `12`: `private final String otaDescUrl;`
- `13`: `private final String otaVersion;`
- `14`: `private final String partName;`
- `15`: `private final String partType;`

### RechargeServiceTimeBean

`analysis/official-apk-static/jadx-owner-combined/sources/com/cfmoto/ui/bean/RechargeServiceTimeBean.java`

- `11`: `private final String frameNo;`
- `12`: `private final String phone;`
- `13`: `private final String rechargeEndDate;`
- `14`: `private final Boolean result;`
- `15`: `private final String serviceRechargeStatus;`
- `16`: `private final String vehicleTypeName;`

## 调用方补充证据

- 保养重置：IHmService 的 `POST keepmileage/reset`，请求体 `{vcu}`；修改单中的简写不是完整路径。
- 围栏：`CarSettingFenceAddActivity.java:461–463,475–530`，半径从米除以 1000 后提交，圆心为“经度,纬度”，编辑保留 rideRangeRule。delFlag 开启为 0、关闭为 1。
- 充电计划：`HmModel$43.java:29–34`，保存返回 String id；再用该 id 启用，两个步骤分别读取计划列表。
- 电话提醒：`LowBatteryWarnActivity.java:523–528,875–888`，读取 withdrawalStartTime/EndTime、ultraLowBatteryReminder；`BatteryViewModel$lowPowerPhoneReminder$1.java:75` 和 `BatteryConstKt.java:17` 确认提交时间带 `:00` 秒。
- 分享：`SharedManagerActivityV2.java:169,230` 和 `ShareManagerAdapter.java:153`，长期和当前临时分享各最多 3 人。`SharedManagerActivityV2.java:120–159` 确认长期和临时授权均用 PUT tempShare 撤销，、shareHours=0；DELETE 的数组体仅用于删除历史，当前界面不提供此操作。
- 卡钥匙删除：`NfcKeyManageActivity.java:516–521`，命令 92 参数为 nfcNo，而非列表 id。
- FCW：`RadarBlindMonitorActivity.java:207–211`，关闭 1、标准 2、灵敏 4；开关开启取标准 2。
- 自动龙头锁：`EasyRideOpActivity.java:1383–1386`，命令 135，参数 1/0。
- 车端密码：`SetUnlockPswActivity.java:149–152` 和 `decoded/res/layout/activity_set_unlock_psw.xml`，命令 70，四位数字；不记录密码。
- 储物箱：`MotoHomeFragment.java:3453`，propertyTwo 命令 29、参数 1。openStorageBoxFlag 只是支持标记，无法据此确认已经打开，结果保留待确认。
- 手机钥匙本机识别：`PairedDevicesActivity.java:533,542`，比较 uniqueIdentify；安装包仅暴露本项目已有的设备标识，用于禁止删除本机。标识未读到时禁用删除。
- 体检：`MotoTestAdapter.java:57,74`，abnormalState 0 正常、1 异常；heteroconstant 为异常数，缺字段不能显示无异常。
- 胎压历史：原网页 `inline-10.decoded.js:1211–1229`，完整路径 `https://h5.zeehoev.com/cfmotoserverapp/H5/vehicle/tire/statistics`，GET 参数 sensorType=EXTERNAL、timePeriodType=1/2、vinNo。`inline-12.decoded.js:2441–2494` 确认 data[].sensorPosition、tirePressureStat.list、tireTempStat.list 及 time/value/displayedValue，时间为秒。
- 首页低胎压：原网页 `inline-12.decoded.js:1655,1713–1733`，只在实有压力且低于 1 bar 时提示，不推测 warningType 各 bit 的高低压含义。
- 设备版本：原网页 `inline-12.decoded.js:3233–3250` 使用 home.otaVersion、iotProperties 中 ECU_Firmware/HMI_Firmware；首页 DTO 记录 activationDate、firstBindDate、bluetoothAddress。

## 合成验证与使用限制

`src/api/owner.test.ts` 对每个读接口覆盖成功、缺字段、失败；对每种写入覆盖响应三种情况以及一次提交、一次读取，不自动重试。`tests/fixtures.ts` 在应用脚本之前替换 fetch，并配合本地 CSP 和外部流量断言。OTA 只有读取接口，没有升级调用；分享、密码、钥匙等必须确认后才提交。
