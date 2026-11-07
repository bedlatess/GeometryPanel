# 原项目功能补齐：新增原生桥合同

此文件是本轮各端共享合同。现有 v1 方法保留，新增方法仍经过同一来源、主 frame、白名单、大小及取消检查。凭据仅在用户启用后台监控、桌面控制或自动任务时交给原生加密库，不输出、不放进诊断。官方登录的本机单次交接例外见下文。

## 账号与车辆

`accounts.sync`: `{accounts,selectedVehicleId}`；`accounts.remove`: `{accountId}`。

`accounts` 最多 8 项：`{id,epoch,uid,token,label,enabled,vehicles}`。`id` 是网页持久化的随机本机 ID，`epoch` 是非负整数，token 或授权改变时递增。vehicles 每账号最多 16 项：`{id,vin,label,epoch,enabled}`，车辆 id 同样是本机稳定 ID。原生替换账号集合，移除账号/车辆、凭据或 epoch 变化时取消旧任务、旧快捷入口和旧作用域。账号/车 id 是不含手机号、uid、VIN 的不透明 ID。

## 后台监控与历史

- `background.configure`: `{enabled,accounts,selectedVehicleId,notifications,lowBatteryThreshold}`。notifications 为 `{chargeStart,chargeProgress,chargeFull,chargeStop,message,lowBattery,offline,tire}` 布尔值，默认监控关闭；阈值 5..80，默认20。资料同 accounts.sync。Android 按旧版 60/150/300 秒及系统后备调度；iOS 只在系统允许时刷新，必须返回实际模式。
- `background.status`: `{}`；`background.run`: `{vehicleId?}` 单次读取；均返回 `{enabled,running,backgroundMode,jobScheduled,lastRun,vehicles:[{id,label,epoch,lastPoll,error,snapshot}]}`。backgroundMode 为 foreground-service/opportunistic/foreground-only。status 与日志不含 token、uid、VIN。snapshot 仅读数/时间。
- `background.history`: `{vehicleId,kind:'battery'|'charge'|'events',before?,limit?}`，limit 1..500，返回 `{kind,items,total}`。
- `history.clear`: `{vehicleId,kind:'battery'|'charge'|'events'|'all',confirmed:true}`，清本机历史；不改变云端。
- 电池项至少 `{at,soc,range,voltage,current,power,charging,online}`；无法确定值用 null。充电项至少 `{id,startedAt,endedAt,startSoc,endSoc,status,sampleCount}`，status 为 charging/full/interrupted/unknown，缺测不能推成充满。事件项 `{id,at,kind,title,body}`，全部脱敏文本。

## 自动任务

- `tasks.configure`: `{enabled,time,requestIntervalMs,actions,postContent,legacyLikeConfirmed}`。time 为本地时间 `HH:mm`，默认09:00；requestIntervalMs 为0..60000整数，默认2000；actions 为 `{signin,streakPrize,like,share,post,cleanup}`，所有布尔值默认false，enabled默认false。legacyLikeConfirmed默认false，只有like与此独立确认同时true才按旧版提交点赞；UI明确接口可能切换已有赞，不把likeType猜成未赞。postContent为用户输入、1..500字符的纯文字；post关闭时允许空串。cleanup仅在post开启时有效。保存配置不立即执行；修改epoch/停用/移除账号时取消旧作用域。
- `tasks.run`: `{accountId?,confirmed:true}`，只对accounts.sync中enabled账号执行已保存配置；未指定accountId按账号依次处理。手动执行不要求定时enabled，但必须明确确认。每个账号同一时刻只允许运行一次；网页与原生不可同时跑同一个账号。发帖必须独立勾选且确认内容；不能把开启签到等于同意发帖。
- `tasks.status`: `{}`，与configure/run均返回 `{enabled,running,backgroundMode,jobScheduled,lastRun,config,accounts:[{id,label,epoch,lastRun,status,steps}]}`。status为 idle/running/completed/partial/failed/cancelled；steps为 `{action,state,reason,at}`，action为signin/streakPrize/like/share/post/cleanup，state为confirmed/skipped/uncertain/failed。reason只能使用已知脱敏枚举（already_done/not_eligible/state_unknown/no_target/daily_gate/evidence_unsafe/accepted_not_verified/network/rejected/expired/cancelled）；不含帖子内容、文章ID、uid、token或服务端原文。backgroundMode为foreground-service/opportunistic/foreground-only。iOS必须返回实际模式，不承诺精确准点。
- 动作顺序：读signin/count和积分任务→按需H5签到并读后核实→只有已签且count>0且count%30==0，并且H5 info.signPrizeDate为北京当天时才领取奖励→未完成任务取最新广场文章，跳过能确认属于自身的文章，每动作最多一次点赞/分享并复查任务→可选发布一次用户文字→可选精确清理本次帖子。日界改变立即停止写操作。写操作不自动重试；每动作发出前持久化每日尝试门闩，网络结果不明也不盲目重发。广场likeType字段存在但语义未确证，不能猜作已赞状态。
- 状态模型：signin/count的signStatus为1已签/0未签，其它值未知；count为非负整数。积分任务为ps0003_01_002_VOList数组，code 1023=post、1026=like、1024=share；completeFlag=0为已完成、1为未完成，其它值未知。每动作对应任务缺失/重复/状态未知则不写。积分字段integralTotal。不臆造目标次数字段。
- 确证端点（APP来源https://tapi.zeehoev.com）：GET `/v1.0/mine/cfmotoservermine/signin/count`；GET `/v1.0/mine/cfmotoservermine/integral/getByUserId?userId=...`；GET `/v1.0/mine/cfmotoservermine/integral/totalIntegral?userId=...`；GET `/v1.0/social/cfmotoserversocial/community/qbTzInfoNewV2?postModule=1&slidingType=0&page=1&pageSize=20`；POST `/v1.0/social/cfmotoserversocial/socialCommu/likeFavoriteInfo` body `{postId,kindFlag:'0'}`；PUT `/v1.0/social/cfmotoserversocial/article/share/{postId}`；GET `/v1.0/mine/cfmotoservermine/integral/adjustByShare`；GET `/v1.0/social/cfmotoserversocial/community/mineArticleInfo?userId=...`；POST `/v1.0/social/cfmotoserversocial/commonArticle` body `{postSubInfo:{topicList:[]},topicid:'',postcontent}`；DELETE `/v1.0/social/cfmotoserversocial/commonArticle/deleteArticle?articleId=...&postType=1`。
- H5来源固定https://h5.zeehoev.com：POST `/cfmotoservermine/H5/signin` body为字面量`{}`；GET `/cfmotoservermine/H5/signin/info?month=YYYY-MM&server_name=SMART`；GET `/cfmotoservermine/H5/signin/supplementPrize?supplementDate=YYYY-MM-DD`。使用H5 appId AiTXmBrm及旧原生H5签名（POST body参与），不能用APP签名。精确证据见k0.java、j0.java和ta.java。
- 清理证据：发帖前完整读取自身文章基线；发帖后以tuuid为ID，校验userid严格等于当前uid、tcontent严格等于本次内容、createDate在请求前后±2秒、ID不在基线，且只有一个匹配。基线/任意必要字段不明、多匹配时一律跳过删除，不使用“最新一条”推断；仅重试读取证据，最多5次、间隔1秒。取消后的未确认发布要报告uncertain，不能继续删旧帖子。

## 桌面与工具

- `widget.configure`: `{widgetId?,vehicleId,style:'1x1'|'2x2'|'4x2'|'4x4',controls:boolean}`。
- `widget.pin`: `{style}`，交系统添加组件；iOS 只能提供系统允许的添加指引。
- `shortcuts.configure`: `{vehicleId,actions:['refresh'|'unlock'|'lock'|'horn'|'seat']}`。iOS 使用系统可支持的意图/深链，并按动作要求前台确认。
- `tools.open`: `{tool:'scanner'|'ota'|'wallpaperZip'|'diagnostics'|'updates'}`，打开真正原生流程，执行所需确认及权限。
- `diagnostics.export`: `{}`，系统保存/分享脱敏诊断。
- `updates.check`: `{}`，固定本仓库 GitHub Release；`updates.install`: `{}`，必须用已核对的候选，不接任意URL。
- `keepalive.export`: `{}`，Android 导出针对本包名的 Magisk/KernelSU 模块，不自动安装/提权。iOS 返回 unsupported。
- `officialLogin.start/stop`: `{}`，Android 用户手动启动/结束官方登录捕获。普通 `officialLogin.result {}` 只返回是否取得会话及已加密导入的本机账号 ID，不回传凭据。`officialLogin.result {importToPanel:true}` 在原生确认后允许同设备单次交接 `{imported:true,accountId,session:{token,uid,vehicles:[{vin,name,type,plate}]}}`，原生核实固定官方车辆列表后交接并消费待交接资料。网页重新读取官方车辆列表、由用户选择后保存到本机加密库，不显示/记录凭据。开发测试不启动 VPN、不抓真实流量。iOS 返回 unsupported。
- `asset.export`: `{kind:'wallpaper',url,fileName,md5?,fileSize?}`；只接受静态恢复白名单对象存储来源及有限文件。
- `asset.export {kind:'panel',fileName:'geometry-status.png',data}`：data 为纯 base64 PNG，解码≤1MiB、边长≤2048，原生再次校验后打开系统保存/分享。网页通过 Canvas 仅绘制白名单车况读数，不截取页面、登录区、坐标、账号或车辆标识。仅此 kind 的请求上限为 1,500,000 字符；账号/后台/任务配置262144，其余16384，历史响应524288。

新 capabilities 特征可增加 background/history/multiAccount/tasks/shortcuts/scanner/ota/diagnostics/updates/officialLogin/keepalive/wallpaperZip；缺失等于不支持。不能用能力 true 代替实际实现，也不将 Android 平台工具冒称为 Safari/iOS 能力。
