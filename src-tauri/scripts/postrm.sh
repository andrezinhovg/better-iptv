#!/bin/sh
# Cleans up the symlink created by postinst.sh (see that file for why it
# exists). Safe to no-op on upgrades: the new package's postinst recreates
# it right after this runs.
set -e

DESKTOP_DIR="/usr/share/applications"
TARGET="$DESKTOP_DIR/com.m0s.better-ip-tv.desktop"

rm -f "$TARGET"

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$DESKTOP_DIR" || true
fi

exit 0
