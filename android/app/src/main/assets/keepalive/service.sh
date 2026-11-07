#!/system/bin/sh
# Geometry Panel Alive —— 开机 late_start 入口；查不到原值就不改对应策略。
MODDIR=${0%/*}
CONF=/data/adb/geometry_panel_alive
PKGCONF=$CONF/pkg
PKG=app.geometrypanel.mobile
[ -f "$PKGCONF" ] && PKG=$(cat "$PKGCONF" 2>/dev/null 9>&-)
# 只允许本壳及调试壳，配置不能把系统策略写到任意包。
case "$PKG" in app.geometrypanel.mobile|app.geometrypanel.mobile.debug) ;; *) exit 1 ;; esac
[ -f "$MODDIR/module.prop" ] || exit 0
[ -f "$MODDIR/disable" ] && exit 0
[ -f "$MODDIR/remove" ] && exit 0

i=0
while [ "$(getprop sys.boot_completed)" != "1" ]; do
  i=$((i + 1)); [ "$i" -gt 300 ] && exit 1
  sleep 2
done
[ -d "/data/data/$PKG" ] || exit 0
mkdir -p "$CONF" 2>/dev/null 9>&- || exit 1
# 停止信号仅由明确的安装收尾清除；普通 service 重入不能抵消正在卸载。
[ -f "$CONF/stop-watch" ] && exit 0
[ -f "$MODDIR/lock.sh" ] || exit 1
. "$MODDIR/lock.sh"
lock_open && lock_take 10 || exit 1
# 原值采集/应用与卸载恢复共用锁，等待启动完成期间也可能被停用。
[ -f "$MODDIR/module.prop" ] || exit 0
[ -f "$MODDIR/disable" ] && exit 0
[ -f "$MODDIR/remove" ] && exit 0
[ -f "$CONF/stop-watch" ] && exit 0
ORIG=$CONF/orig
if [ ! -e "$ORIG" ]; then
  listed=unknown; appops=unknown; bucket=unknown
  if listing=$(cmd deviceidle whitelist 2>/dev/null 9>&-); then
    listed=$(printf '%s\n' "$listing" 9>&- | awk -F, -v pkg="$PKG" '
      $0 == pkg || $2 == pkg { found = 1 }
      END { print found + 0 }' 9>&-)
  fi
  if ops=$(cmd appops get "$PKG" RUN_ANY_IN_BACKGROUND 2>/dev/null 9>&-); then
    mode=$(printf '%s\n' "$ops" 9>&- | sed -n 's/.*RUN_ANY_IN_BACKGROUND: *\([a-z_]*\).*/\1/p' 9>&- | head -1 9>&-)
    case "$mode" in allow|ignore|deny|default|foreground) appops=$mode ;; esac
    [ "$ops" = "No operations." ] && appops=default
  fi
  if value=$(am get-standby-bucket "$PKG" 2>/dev/null 9>&-); then
    case "$value" in 5|10|20|30|40|45|50) bucket=$value ;; esac
  fi
  # 包名和格式一并记录；成功原子换名后才有资格改策略，不能留下半份原值。
  tmp=$ORIG.tmp.$$
  if ! printf 'format=2\npkg=%s\ndeviceidle=%s\nappops=%s\nbucket=%s\n' "$PKG" "$listed" "$appops" "$bucket" > "$tmp" \
      || ! mv -f "$tmp" "$ORIG" 9>&-; then
    rm -f "$tmp" 2>/dev/null 9>&-
    exit 1
  fi
fi
format=$(sed -n 's/^format=//p' "$ORIG" 2>/dev/null 9>&- | head -1 9>&-)
owner=$(sed -n 's/^pkg=//p' "$ORIG" 2>/dev/null 9>&- | head -1 9>&-)
# 旧版的 0/1 appops、文字 bucket 不是确切原值，不能据此改动或伪造恢复。
if [ "$format" = "2" ] && [ "$owner" = "$PKG" ] && [ ! -f "$CONF/stop-watch" ] \
    && [ ! -f "$MODDIR/disable" ] && [ ! -f "$MODDIR/remove" ] && [ -f "$MODDIR/module.prop" ]; then
  listed=$(sed -n 's/^deviceidle=//p' "$ORIG" 9>&- | head -1 9>&-)
  appops=$(sed -n 's/^appops=//p' "$ORIG" 9>&- | head -1 9>&-)
  bucket=$(sed -n 's/^bucket=//p' "$ORIG" 9>&- | head -1 9>&-)
  case "$listed" in 0) cmd deviceidle whitelist +"$PKG" >/dev/null 2>&1 9>&- ;; esac
  case "$appops" in ignore|deny|default|foreground) cmd appops set "$PKG" RUN_ANY_IN_BACKGROUND allow >/dev/null 2>&1 9>&- ;; esac
  case "$bucket" in 5|20|30|40|45|50) am set-standby-bucket "$PKG" active >/dev/null 2>&1 9>&- ;; esac
fi
lock_close
exec sh "$MODDIR/watchdog.sh"
