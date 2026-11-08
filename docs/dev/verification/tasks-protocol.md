# 签到、积分与自动任务静态合同

本轮只使用已授权旧 APK 恢复物；没有执行旧 bundle，也没有使用真实账号、短信、发帖、积分领取或车辆控制。静态合同与合成测试不等于当前服务端、跨域或手机后台已实测成功。

## 结构与默认值

`src/api/tasks.ts` 统一原始 API 与可取消顺序编排；`core/tasks-model.ts` 保留确证字段、严格解析和唯一发帖证据；`core/tasks-store.ts` 保存当前本机账号的设置，并用单独 IndexedDB 原子事务保存每日尝试门闩；`ui/tasks.ts` 负责确认和显示，不记录原始上游响应。原生端使用 `parity-bridge-v2.md` 的同一配置和脱敏结果合同。

所有动作、定时开关、`legacyLikeConfirmed` 默认 false；保存设置不执行。发帖必须单独勾选、输入文字，再确认。清理只有发帖开启时允许。网页关闭会中止后续流程；原生支持任务时统一交给原生执行，避免网页与后台双跑。iOS 系统只提供机会刷新，不能承诺关闭后的准点任务。

## 确证来源

- `jadx/sources/defpackage/j0.java` case0：GET `/v1.0/mine/cfmotoservermine/signin/count`；case1：H5 POST signin，UTF-8字面量`{}`；case2：广场GET查询 `postModule=1,slidingType=0,page=1,pageSize=20`；default：GET adjustByShare。
- `k0.java` case1/2：H5 GET info（month为YYYY-MM，server_name=SMART）与 supplementPrize（supplementDate为YYYY-MM-DD）。case3/6：GET integral/getByUserId。case4：POST likeFavoriteInfo，body `{postId,kindFlag:"0"}`；case5：PUT article/share/{postId}；case0/7：自身文章GET；case8：POST commonArticle，body `{postSubInfo:{topicList:[]},topicid:"",postcontent}`。
- `ta.java` case1：GET integral/totalIntegral，userId；default：DELETE commonArticle/deleteArticle，query articleId/postType=1。没有把删除改成POST或凭“最新文章”猜删。
- `g.java` 的 `r(f)` 只从data数组读取 `tuuid,userid,tcontent,createDate`。`eb.java` 使用严格北京时间 `uuuu-MM-dd HH:mm:ss[.1..6位小数]` 解析，ID拒绝0、布尔/null占位与危险URL字符。
- `p0.java` 的 b/g 与 `apktool/smali/p0.smali`：奖励只在签到count为正30倍数且今日signPrizeDate成立时尝试；清理前读取基线，之后要求新ID、相同作者/内容、请求时间±2秒、唯一匹配。证据读取最多5次，每次间隔1秒；没有自动补发帖子。
- `web-published/inline-18.decoded.js` 的 `_0x49cdec`：1023=post、1026=like、1024=share；`_0x1fb3b1`：completeFlag 0为已完成。任务容器 `ps0003_01_002_VOList`，总积分 `integralTotal`。没有恢复到目标次数字段，每动作最多一次；缺失/重复/陌生状态跳过。
- `zc.java.c1` 与原生任务分支：count响应 `signStatus` 1为已签；未知状态保留未知。H5签到响应 continueDays/signCount不代替APP读后核实。

## 签名与来源

APP继续使用既有固定tapi来源和原签名。H5只允许 `https://h5.zeehoev.com/cfmotoservermine/H5/signin` 及其 info/supplementPrize 子路径，不能传任意主机。H5使用AiTXmBrm及旧原生H5密钥，MD5(hexSHA1(sortedQuery + exactBody + parameters + secret))；POST的`{}`参与签名。原生nonce为UUID。独立.NET黄金向量校验body参与，既有APP黄金向量和空PUT回归继续通过。

## 结果、重复与边界

- 签到后重新读count；点赞/分享后重新读任务标志。ACK不直接当作完成。领奖必须当天资格匹配，结果只有奖品名明确才显示已核实；无法确认时不自动重复。
- 每个写动作发出前保存原子每日尝试记录，网络失败/取消/跨日后不盲目重发。写请求不重试。读取可以重新刷新；跨北京时间日界停止后续写操作。
- likeType字段只有显示映射，没有恢复到0/1语义，也未证明likeFavoriteInfo是否切换已有赞。只选like会跳过；必须独立同意 `legacyLikeConfirmed`，界面明确可能切换已有点赞，才提交旧版相同body。不会猜likeType=0代表未赞。
- post先读自身文章完整基线。仅新ID且userid等于当前账号、tcontent逐字等于本次文字、createDate处于请求前后±2秒、只有一项匹配时可定位。任何必要字段缺失、多匹配或证据读取失败时不删除。网络发布结果不明但唯一证据成立时可按已授权cleanup精确清理；仍不补发。
- 设备保存配置含用户输入文字，仅留本机；账号移除时主工程调用clearTaskConfig。尝试门闩仅保存不透明本机账号ID、日期、动作和布尔值，不含uid、token、VIN或帖子文字。结果步骤只有动作、状态、固定原因和时间，不回传文章ID或上游原文。

## 自动验证

`src/api/tasks.test.ts` 与 `core/tasks-model.test.ts` 覆盖签名、固定来源、精确请求、默认关闭、额外点赞同意、标志映射、签到/奖励条件、唯一发帖清理、模糊发布、每日防重复、账号快照、失效认证、取消和跨日。

`tests/tasks.spec.ts` 用请求前fetch替换与本地CSP隔绝真实上游，Chrome/WebKit各7个场景通过：只读默认、签到确认、精确清理、不安全证据、独立点赞同意、发布中关闭和原生授权先于同步。不把这些合成浏览器检查称为真实Safari或社区验收。最终合并后的完整构建与回归由主任务统一执行。
