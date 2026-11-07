#!/system/bin/sh
# 所有发布/原策略事务共用内核锁；锁文件永不删除，避免两个 inode 各自拿锁。
# 设备重启或最后一个持有 fd 的进程退出才释放锁；父进程 SIGKILL 不会撤掉子进程副本。
# flock 操作必须继承 fd9；其它工具/等待子进程在调用处 9>&-，避免后代意外长期占锁。
BB=/data/adb/ksu/bin/busybox
[ -x "$BB" ] || BB=busybox
lock_command() {
  if command -v flock >/dev/null 2>&1; then flock "$@"; else "$BB" flock "$@"; fi
}
lock_open() { exec 9>>"$CONF/state.lock"; }
lock_take() {
  local i=0 limit="${1:-1}"
  while ! lock_command -n 9 2>/dev/null; do
    i=$((i + 1)); [ "$i" -ge "$limit" ] && return 1
    sleep 1 9>&-
  done
}
lock_close() { lock_command -u 9 2>/dev/null; exec 9>&-; }
