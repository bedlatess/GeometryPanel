#!/system/bin/sh
# Geometry Panel Alive —— 低功耗看门狗。
# Adapted from authorized original; no device validation in this project.
MODDIR=${0%/*}
CONF=/data/adb/geometry_panel_alive
PKGCONF=$CONF/pkg
DEFAULT_PKG=app.geometrypanel.mobile
PKG=$DEFAULT_PKG
[ -f "$PKGCONF" ] && PKG=$(cat "$PKGCONF" 2>/dev/null)
case "$PKG" in app.geometrypanel.mobile|app.geometrypanel.mobile.debug) ;; *) exit 1 ;; esac
mkdir -p "$CONF" 2>/dev/null || exit 1

INTERVAL=60          # 巡检间隔（秒）
HEARTBEAT=300        # 标记心跳刷新间隔（秒）
FRESH=$((HEARTBEAT * 2))   # 面板判定新鲜度阈值（秒）

[ -f "$MODDIR/lock.sh" ] || exit 1
. "$MODDIR/lock.sh"
lock_open || exit 1
have() { command -v "$1" >/dev/null 2>&1; }

# 脱离 cgroup 冻结域 + 低内存不被优先回收（best-effort，失败不致命）
escape() {
  for f in /sys/fs/cgroup/cgroup.procs /dev/cgroup/cgroup.procs /dev/freezer/cgroup.procs \
           /dev/cpuctl/cgroup.procs /dev/cpuset/cgroup.procs /dev/memcg/cgroup.procs /acct/cgroup.procs; do
    [ -w "$f" ] && echo $$ > "$f" 2>/dev/null
  done
  echo -1000 > "/proc/$$/oom_score_adj" 2>/dev/null
}
escape

read_gate() {
  GATE=0
  [ -f "/data/data/$PKG/no_backup/background.enabled" ] && GATE=1
}

# 模块自身版本号：从 module.prop 现读，别写死——否则发版时容易忘了同步这行，
# 标记里的 ver 就会停在旧值，排查"装的是不是新版"时反而误导。
MODVER=$(sed -n 's/^versionCode=//p' "$MODDIR/module.prop" 2>/dev/null | head -1)
[ -z "$MODVER" ] && MODVER=0
MODNAME=$(sed -n 's/^version=//p' "$MODDIR/module.prop" 2>/dev/null | head -1)

# 挑一个代表进程：MonitorService 在应用进程里，直接用包名 pidof
app_pid() { "$BB" pidof "$PKG" 2>/dev/null | awk '{print $1}'; }

write_marker() {
  local active="$1" pid="$2" now
  now=$(date +%s)
  local D="/data/media/0/Android/data/$PKG/files"
  mkdir -p "$D" 2>/dev/null || return
  local U; U=$(stat -c %u "/data/data/$PKG" 2>/dev/null)
  [ -z "$U" ] && U=0
  local tmp="$D/.zeeho_alive.tmp"
  printf '{"installed":1,"active":%s,"pid":%s,"pkg":"%s","ver":%s,"vn":"%s","at":%s}\n' \
    "$active" "${pid:-0}" "$PKG" "$MODVER" "$MODNAME" "$now" > "$tmp" 2>/dev/null
  $BB chcon u:object_r:media_rw_data_file:s0 "$tmp" 2>/dev/null
  chown "$U:$U" "$tmp" 2>/dev/null
  chmod 0640 "$tmp" 2>/dev/null
  mv -f "$tmp" "$D/zeeho_alive.json" 2>/dev/null
}

set_props() {
  resetprop -n zeeho.alive.active "$1" 2>/dev/null
  resetprop -n zeeho.alive.at "$(date +%s)" 2>/dev/null
  resetprop -n zeeho.alive.ver "$MODVER" 2>/dev/null
}

stopping() {
  [ ! -f "$MODDIR/module.prop" ] || [ -f "$MODDIR/disable" ] || [ -f "$MODDIR/remove" ] \
    || [ -f "$CONF/stop-watch" ] || [ ! -d "/data/data/$PKG" ]
}

# 发布与卸载共用短锁；拿锁后再查停止信号，避免卸载刚删完又被一跳重建。
publish() {
  lock_take || return
  if ! stopping; then
    write_marker "$1" "$2" 9>&-
    set_props "$1" 9>&-
  fi
  lock_command -u 9 2>/dev/null
}

last_hb=0
last_kick=$(date +%s)
while true; do
  # 模块目录消失同样要退出；退出不再写 installed=1 的新标记。
  if stopping; then
    resetprop --delete zeeho.alive.active 2>/dev/null
    resetprop --delete zeeho.alive.at 2>/dev/null
    resetprop --delete zeeho.alive.ver 2>/dev/null
    rm -f "/data/media/0/Android/data/$PKG/files/zeeho_alive.json" 2>/dev/null
    exit 0
  fi
  # 用户手动暂停保活
  if [ -f "$CONF/disable-watch" ]; then
    publish 0 0; sleep $INTERVAL 9>&-; continue
  fi

  read_gate
  now=$(date +%s)
  if [ "$GATE" = "1" ]; then
    pid=$(app_pid)
    # 读的是运行时钟，不是成功车况；HTTP 故障、无新数据也不会变成一分钟一次强制请求。
    beat=$(sed -n 's/.*name="no_secret_heartbeat_at"[^>]*value="\([0-9]*\)".*/\1/p' \
      "/data/data/$PKG/shared_prefs/native-keepalive.xml" 2>/dev/null | head -1)
    stale_beat=1
    # 限长度且不接受未来时钟；脏值不能造成算术溢出或永久假健康。
    if [ -n "$pid" ] && [ -n "$beat" ] && [ "${#beat}" -le 13 ]; then
      age=$((now - beat / 1000))
      [ "$beat" -gt 0 ] && [ "$age" -ge 0 ] && [ "$age" -lt $((HEARTBEAT + 90)) ] && stale_beat=0
    fi
    # 未知心跳也等最长静置周期 + 90 秒余量，失败重试共用冷却，不能每一跳强催。
    if [ "$stale_beat" = "1" ] && [ $((now - last_kick)) -ge $((HEARTBEAT + 90)) ]; then
      if [ -z "$pid" ]; then
        am start-foreground-service -n "$PKG/.BackgroundService" >/dev/null 2>&1 9>&-
      fi
      cmd jobscheduler run -f "$PKG" 2101 >/dev/null 2>&1 9>&-
      last_kick=$now
    fi
    [ $((now - last_hb)) -ge $HEARTBEAT ] && { publish 1 "$$"; last_hb=$now; }
  else
    last_kick=$now
    [ $((now - last_hb)) -ge $HEARTBEAT ] && { publish 0 0; last_hb=$now; }
  fi
  sleep $INTERVAL 9>&-
done
