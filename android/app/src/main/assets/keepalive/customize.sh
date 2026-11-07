#!/sbin/sh
# 安装收尾：准备运行目录。
CONF=/data/adb/geometry_panel_alive
mkdir -p "$CONF" 2>/dev/null
chmod 0755 "$CONF" 2>/dev/null
# customize 只在管理器安装时执行；不重写 orig，恢复失败的救援原值必须保留。
[ -f "$MODPATH/lock.sh" ] || abort "- keepalive lock helper missing"
. "$MODPATH/lock.sh"
lock_open && lock_take 10 || abort "- keepalive state is busy"
rm -f "$CONF/stop-watch" 2>/dev/null 9>&- || abort "- keepalive cannot resume"
lock_close
ui_print "- zeeho dashboard alive: 保活脚本已就位"