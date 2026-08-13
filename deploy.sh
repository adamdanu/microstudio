#!/bin/bash
# MicroStudio zero-downtime deploy (run from the Mac).
# 1. Build locally (fast, no box contention)
# 2. Ship the prebuilt .next bundle (pure JS, portable to the aarch64 box)
# 3. Atomic swap + ~2s restart on the box (old .next kept for rollback)
#
# Usage:
#   ./deploy.sh            # build + ship source diff + .next, swap, restart
#   ./deploy.sh --quick    # skip rebuild, reuse existing local .next
#   ./deploy.sh --no-src   # ship only .next, skip source sync
set -euo pipefail

HOST=192.168.100.190
SSH="expect /tmp/bx.exp"
APP=/media/HDD2/apps/microstudio
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"
QUICK=0
NO_SRC=0
for a in "$@"; do
  case "$a" in
    --quick) QUICK=1 ;;
    --no-src) NO_SRC=1 ;;
  esac
done

echo "==> [1/5] Local build"
if [ "$QUICK" = 1 ]; then
  echo "    skipping rebuild (--quick)"
else
  ( cd "$LOCAL_DIR" && npm run build 2>&1 | grep -E "Compiled successfully|Generating|error|Error" | head -5 )
  [ -f "$LOCAL_DIR/.next/BUILD_ID" ] || { echo "BUILD FAILED"; exit 1; }
fi

echo "==> [2/5] Package .next + changed source"
NEXT_TGZ=/tmp/micro-next.tgz
SRC_TGZ=/tmp/micro-src.tgz
( cd "$LOCAL_DIR" && tar --exclude='.next/cache' --exclude='._*' -czf "$NEXT_TGZ" .next )
echo "    .next: $(du -h "$NEXT_TGZ" | cut -f1)"

# Sync source diff (everything except build/node_modules/.git/design extras)
if [ "$NO_SRC" != 1 ]; then
  ( cd "$LOCAL_DIR" && git add -A >/dev/null 2>&1 || true
    git diff --cached --name-only >/dev/null 2>&1 || true )
  # ship committed tracked files that changed vs box? simpler: tar whole source, box only re-prisma's if schema changed
  tar --exclude='node_modules' --exclude='.next' --exclude='.git' \
      --exclude='.next-old' --exclude='.npm-cache' --exclude='.env' \
      --exclude='design' --exclude='tmp' --exclude='._*' \
      -czf "$SRC_TGZ" \
      -C "$LOCAL_DIR" app lib prisma next.config.ts package.json .gitignore 2>/dev/null
  echo "    src: $(du -h "$SRC_TGZ" | cut -f1)"
fi

echo "==> [3/5] Ship to box"
scp_push() { expect -c "
  set timeout 300
  spawn scp -o StrictHostKeyChecking=accept-new $1 root@$HOST:$2
  expect { \"assword:\" { send \"admin01\r\"; exp_continue } eof }
" 2>&1 | tail -1; }
scp_push "$NEXT_TGZ" /tmp/micro-next.tgz
if [ "$NO_SRC" != 1 ]; then scp_push "$SRC_TGZ" /tmp/micro-src.tgz; fi

echo "==> [4/5] Remote atomic swap + restart"
expect /tmp/bx.exp "bash /tmp/zdd-remote.sh /tmp/micro-next.tgz /tmp/micro-src.tgz" 2>&1 | tail -8

echo "==> [5/5] Verify public URL"
sleep 3
curl -s -o /dev/null -w "public login: %{http_code}\n" -m 20 https://app.microstudio.web.id/login

echo "DONE. (old build kept at \$APP/.next-old until next deploy)"
