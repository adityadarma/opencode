#!/usr/bin/env bash
# Builds opencode from source for the current platform and replaces the
# global `opencode` link (~/.local/bin/opencode) with the built binary.
# Local dev tool only, never committed or pushed anywhere.
#
# Run from the package root (packages/opencode):
#   ./script/build-local-install.sh [--install] [--baseline] [--with-web-ui]

set -euo pipefail

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$dir"

install_flag=(--skip-install)
baseline_flag=()
web_ui_flag=(--skip-embed-web-ui)

for arg in "$@"; do
  case "$arg" in
    --install) install_flag=() ;;
    --baseline) baseline_flag=(--baseline) ;;
    --with-web-ui) web_ui_flag=() ;;
  esac
done

package_version="$(bun -e 'console.log(require("./package.json").version)')"

echo "Building opencode ${package_version} for the current platform..."
OPENCODE_VERSION="$package_version" bun run script/build.ts --single \
  "${install_flag[@]+"${install_flag[@]}"}" \
  "${baseline_flag[@]+"${baseline_flag[@]}"}" \
  "${web_ui_flag[@]+"${web_ui_flag[@]}"}"

case "$(uname -s)" in
  Darwin) platform="darwin" ;;
  Linux) platform="linux" ;;
  *) echo "Unsupported platform: $(uname -s)" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  arm64|aarch64) arch="arm64" ;;
  x86_64) arch="x64" ;;
  *) echo "Unsupported arch: $(uname -m)" >&2; exit 1 ;;
esac

name="opencode-${platform}-${arch}"
[ -n "${baseline_flag[*]:-}" ] && name="${name}-baseline"

built_binary="$dir/dist/${name}/bin/opencode"
if [ ! -f "$built_binary" ]; then
  echo "Built binary not found at $built_binary" >&2
  exit 1
fi

target_dir="$HOME/.local/bin"
target="$target_dir/opencode"

mkdir -p "$target_dir"
echo "Installing to $target"
echo "  from $built_binary"

# Remove any existing file/symlink (e.g. the npm-managed symlink) before
# copying so we don't write through it into the npm package cache.
rm -f "$target"
cp -f "$built_binary" "$target"
chmod 755 "$target"

version="$("$target" --version)"
echo "Installed local build: opencode $version"
echo "Make sure $target_dir comes before any other opencode install in your PATH."
