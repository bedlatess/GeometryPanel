#!/system/bin/sh
# Geometry Panel Alive —— 卸载先停发布，再还原能确认的原策略。
CONF=/data/adb/geometry_panel_alive
mkdir -p "$CONF" 2>/dev/null 9>&- || exit 1
# 保留停止信号直到重新安装启动；看门狗不能在卸载后重建标记。
: > "$CONF/stop-watch" || exit 1
PKGCONF=$CONF/pkg
PKG=app.geometrypanel.mobile
[ -f "$PKGCONF" ] && PKG=$(cat "$PKGCONF" 2>/dev/null 9>&-)
case "$PKG" in app.geometrypanel.mobile|app.geometrypanel.mobile.debug) ;; *) exit 1 ;; esac
# 与发布、原值采集/应用共用内核锁；超时保留停止信号与 orig 供重试。
MODDIR=${0%/*}
[ -f "$MODDIR/lock.sh" ] || exit 1
. "$MODDIR/lock.sh"
lock_open && lock_take 10 || exit 1
# 安装收尾可能在我们等锁时删过早到的停止信号；恢复事务拿锁后必须重新确立它。
: > "$CONF/stop-watch" || exit 1
resetprop --delete zeeho.alive.active 2>/dev/null 9>&-
resetprop --delete zeeho.alive.at 2>/dev/null 9>&-
resetprop --delete zeeho.alive.ver 2>/dev/null 9>&-
rm -f "/data/media/0/Android/data/$PKG/files/zeeho_alive.json" 2>/dev/null 9>&-
rm -f "/storage/emulated/0/Android/data/$PKG/files/zeeho_alive.json" 2>/dev/null 9>&-
rm -f "$CONF/watch.pid" 2>/dev/null 9>&-

ORIG=$CONF/orig
format=$(sed -n 's/^format=//p' "$ORIG" 2>/dev/null 9>&- | head -1 9>&-)
owner=$(sed -n 's/^pkg=//p' "$ORIG" 2>/dev/null 9>&- | head -1 9>&-)
# 旧版只存 appops=0/1，无法知道当时是 deny 还是 default；不猜、不删原记录。
if [ "$format" = "2" ] && [ "$owner" = "$PKG" ]; then
  listed=$(sed -n 's/^deviceidle=//p' "$ORIG" 9>&- | head -1 9>&-)
  appops=$(sed -n 's/^appops=//p' "$ORIG" 9>&- | head -1 9>&-)
  bucket=$(sed -n 's/^bucket=//p' "$ORIG" 9>&- | head -1 9>&-)
  failed=0
  case "$listed" in
    0) cmd deviceidle whitelist -"$PKG" >/dev/null 2>&1 9>&- || failed=1 ;;
    1|unknown) ;; *) failed=1 ;;
  esac
  case "$appops" in
    ignore|deny|default|foreground) cmd appops set "$PKG" RUN_ANY_IN_BACKGROUND "$appops" >/dev/null 2>&1 9>&- || failed=1 ;;
    allow|unknown) ;; *) failed=1 ;;
  esac
  case "$bucket" in
    5|20|30|40|45|50) am set-standby-bucket "$PKG" "$bucket" >/dev/null 2>&1 9>&- || failed=1 ;;
    10|unknown) ;; *) failed=1 ;;
  esac
  [ "$failed" = "0" ] || exit 1
  rm -f "$ORIG" 2>/dev/null 9>&- || exit 1
fi
exit 0
