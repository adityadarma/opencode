#!/usr/bin/env bash

set -euo pipefail

repo="${OPENCODE_CUSTOM_REPO:-__GITHUB_REPOSITORY__}"
tag="${OPENCODE_CUSTOM_TAG:-custom-latest}"
install_dir="${OPENCODE_INSTALL_DIR:-$HOME/.local/bin}"

case "$(uname -s)" in
  Darwin) os="darwin" ;;
  Linux) os="linux" ;;
  MINGW*|MSYS*|CYGWIN*) os="windows" ;;
  *) echo "Unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  arm64|aarch64) arch="arm64" ;;
  x86_64|amd64) arch="x64" ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

is_musl=false
if [ "$os" = "linux" ] && { [ -f /etc/alpine-release ] || (command -v ldd >/dev/null && ldd --version 2>&1 | grep -qi musl); }; then
  is_musl=true
fi

baseline=""
if [ "$arch" = "x64" ]; then
  has_avx2=false
  if [ "$os" = "linux" ] && grep -qwi avx2 /proc/cpuinfo 2>/dev/null; then
    has_avx2=true
  elif [ "$os" = "darwin" ] && [ "$(sysctl -n hw.optional.avx2_0 2>/dev/null || true)" = "1" ]; then
    has_avx2=true
  elif [ "$os" = "windows" ]; then
    has_avx2=true
  fi
  if [ "$has_avx2" = "false" ]; then
    baseline="-baseline"
  fi
fi

target="$os-$arch$baseline"
[ "$is_musl" = "true" ] && target="$target-musl"

extension="zip"
[ "$os" = "linux" ] && extension="tar.gz"
archive="opencode-$target.$extension"
url="https://github.com/$repo/releases/download/$tag/$archive"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Downloading $url"
curl -fL "$url" -o "$tmp/$archive"
if [ "$extension" = "tar.gz" ]; then
  tar -xzf "$tmp/$archive" -C "$tmp"
else
  unzip -q "$tmp/$archive" -d "$tmp"
fi

mkdir -p "$install_dir"
binary="opencode"
[ "$os" = "windows" ] && binary="opencode.exe"
install -m 755 "$tmp/$binary" "$install_dir/$binary"

echo "Installed $install_dir/$binary"
echo "Add $install_dir to PATH if it is not already present."
