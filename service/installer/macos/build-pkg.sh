#!/bin/bash
# build-pkg.sh — Builds a macOS .pkg installer for Quills.
#
# Usage:
#   ./build-pkg.sh <version> <binary-path>
#   ./build-pkg.sh 0.9.0 ../../bin/quills
#
# Output: Quills-<version>.pkg in the current directory.

set -euo pipefail

VERSION="${1:?Usage: build-pkg.sh <version> <binary-path>}"
BINARY="${2:?Usage: build-pkg.sh <version> <binary-path>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STAGING="$(mktemp -d)"
PKG_ID="io.github.shakedex.quills"
OUTPUT="Quills-${VERSION}.pkg"

echo "==> Building Quills ${VERSION} macOS installer"
echo "    Binary: ${BINARY}"
echo "    Staging: ${STAGING}"

# Stage the binary.
mkdir -p "${STAGING}/usr/local/bin"
cp "${BINARY}" "${STAGING}/usr/local/bin/quills"
chmod 755 "${STAGING}/usr/local/bin/quills"

# Stage the LaunchAgent plist (installed by postinstall script).
mkdir -p "${STAGING}/usr/local/share/quills"
cp "${SCRIPT_DIR}/io.github.shakedex.quills.plist" "${STAGING}/usr/local/share/quills/"

# Stage the postinstall script.
SCRIPTS="$(mktemp -d)"
cp "${SCRIPT_DIR}/postinstall" "${SCRIPTS}/postinstall"
chmod 755 "${SCRIPTS}/postinstall"

# Build the component package.
echo "==> Running pkgbuild..."
pkgbuild \
    --root "${STAGING}" \
    --identifier "${PKG_ID}" \
    --version "${VERSION}" \
    --scripts "${SCRIPTS}" \
    --install-location / \
    "${OUTPUT}"

echo "==> Created ${OUTPUT}"

# Clean up.
rm -rf "${STAGING}" "${SCRIPTS}"
