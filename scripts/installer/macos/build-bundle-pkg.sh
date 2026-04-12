#!/bin/bash
# build-bundle-pkg.sh — Builds a macOS .pkg that installs both HedgeBuddy and Quills.
#
# Usage:
#   ./build-bundle-pkg.sh <hb_version> <quills_version> <HedgeBuddy.app dir> <quills binary>
#   ./build-bundle-pkg.sh 0.9.0 0.9.0 /path/to/HedgeBuddy.app /path/to/quills
#
# Output: HedgeBuddy-Suite-v<hb>-quills-v<quills>.pkg in the current directory.

set -euo pipefail

VERSION_HB="${1:?Usage: build-bundle-pkg.sh <hb_version> <quills_version> <HedgeBuddy.app> <quills>}"
VERSION_QUILLS="${2:?Usage: build-bundle-pkg.sh <hb_version> <quills_version> <HedgeBuddy.app> <quills>}"
HB_APP="${3:?Usage: build-bundle-pkg.sh <hb_version> <quills_version> <HedgeBuddy.app> <quills>}"
QUILLS_BIN="${4:?Usage: build-bundle-pkg.sh <hb_version> <quills_version> <HedgeBuddy.app> <quills>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STAGING="$(mktemp -d)"
PKG_ID="io.github.shakedex.hedgebuddy-suite"
OUTPUT="HedgeBuddy-Suite-v${VERSION_HB}-quills-v${VERSION_QUILLS}.pkg"

echo "==> Building HedgeBuddy Suite macOS installer"
echo "    HedgeBuddy: ${HB_APP}"
echo "    Quills:     ${QUILLS_BIN}"
echo "    Staging:    ${STAGING}"

# Stage HedgeBuddy.app to ~/Applications (no password prompt).
mkdir -p "${STAGING}/Users/Shared/Applications"
cp -r "${HB_APP}" "${STAGING}/Users/Shared/Applications/HedgeBuddy.app"

# Stage Quills binary.
mkdir -p "${STAGING}/usr/local/bin"
cp "${QUILLS_BIN}" "${STAGING}/usr/local/bin/quills"
chmod 755 "${STAGING}/usr/local/bin/quills"

# Stage the Quills LaunchAgent plist (postinstall copies to user's ~/Library/LaunchAgents).
mkdir -p "${STAGING}/usr/local/share/quills"
cp "${SCRIPT_DIR}/io.github.shakedex.quills.plist" "${STAGING}/usr/local/share/quills/"

# Stage the postinstall script.
SCRIPTS="$(mktemp -d)"
cp "${SCRIPT_DIR}/postinstall-bundle" "${SCRIPTS}/postinstall"
chmod 755 "${SCRIPTS}/postinstall"

# Build the component package.
echo "==> Running pkgbuild..."
pkgbuild \
    --root "${STAGING}" \
    --identifier "${PKG_ID}" \
    --version "${VERSION_HB}" \
    --scripts "${SCRIPTS}" \
    --install-location / \
    "${OUTPUT}"

echo "==> Created ${OUTPUT}"

# Clean up.
rm -rf "${STAGING}" "${SCRIPTS}"
