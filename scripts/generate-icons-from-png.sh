#!/usr/bin/env bash

# Generate Electron app icons from a PNG (and optionally recolor to white)
# - Creates: icon.png, icon@2x.png, icon.ico, icon.icns, tray icons
# - Optional: CLI web header logos (logo_dark.png, logo_light.png)
#
# Requirements:
# - ImageMagick ("magick" or "convert")
# - macOS only for .icns: iconutil (built-in on macOS)
#
# Usage examples:
#   scripts/generate-icons-from-png.sh -i ./my-logo.png
#   scripts/generate-icons-from-png.sh -i ./my-logo.png --recolor white
#   scripts/generate-icons-from-png.sh -i ./my-logo.png --web-dir crates/goose-cli/static/img
#   scripts/generate-icons-from-png.sh -i ./my-logo.png -o ui/desktop/src/images --fuzz 15% --recolor opaque-black

set -euo pipefail

die() { echo "Error: $*" >&2; exit 1; }
log() { echo "[icons] $*"; }

# Pick ImageMagick command (prefer `magick`, fallback to `convert`)
if command -v magick >/dev/null 2>&1; then
  IM=(magick)
elif command -v convert >/dev/null 2>&1; then
  IM=(convert)
else
  die "ImageMagick not found. Install via: brew install imagemagick"
fi

INPUT=""
OUT_DIR="ui/desktop/src/images"
WEB_DIR=""          # optional: crates/goose-cli/static/img
RECOLOR=""          # '', 'white', 'invert', 'opaque-black'
FUZZ="15%"          # used for opaque-black
SKIP_ICNS=0
SKIP_ICO=0
SKIP_TRAY=0
VERBOSE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -i|--input) INPUT=${2:-}; shift 2 ;;
    -o|--out-dir) OUT_DIR=${2:-}; shift 2 ;;
    --web-dir) WEB_DIR=${2:-}; shift 2 ;;
    --recolor) RECOLOR=${2:-}; shift 2 ;;
    --fuzz) FUZZ=${2:-}; shift 2 ;;
    --skip-icns) SKIP_ICNS=1; shift ;;
    --skip-ico) SKIP_ICO=1; shift ;;
    --skip-tray) SKIP_TRAY=1; shift ;;
    -v|--verbose) VERBOSE=1; shift ;;
    -h|--help)
      cat << EOF
Generate Goose Desktop icons from a PNG

Options:
  -i, --input <file>       Path to source PNG (required)
  -o, --out-dir <dir>      Output directory for app icons (default: ui/desktop/src/images)
      --web-dir <dir>      Also output CLI web assets (logo_dark.png, logo_light.png) to this directory
      --recolor <mode>     Optional recolor: white | invert | opaque-black
      --fuzz <percent>     Fuzz threshold for opaque-black (default: 15%)
      --skip-icns          Skip generating .icns (macOS app icon)
      --skip-ico           Skip generating .ico (Windows app icon)
      --skip-tray          Skip tray/menu template icons
  -v, --verbose            Verbose output
  -h, --help               Show help
EOF
      exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done

[[ -n "$INPUT" ]] || die "--input is required"
[[ -f "$INPUT" ]] || die "Input file not found: $INPUT"

mkdir -p "$OUT_DIR"
[[ -n "$WEB_DIR" ]] && mkdir -p "$WEB_DIR"

# Prepare working image (optionally recolored)
WORK=$(mktemp -t goose_icon_src.XXXXXX.png)
trap 'rm -f "$WORK"' EXIT

case "$RECOLOR" in
  "")
    cp "$INPUT" "$WORK"
    ;;
  white)
    # Force non-transparent content to white, preserve alpha
    "${IM[@]}" "$INPUT" -alpha on -channel RGB -fill white -colorize 100 "$WORK"
    ;;
  invert)
    # Invert RGB channels, keep alpha as-is
    "${IM[@]}" "$INPUT" -channel RGB -negate "$WORK"
    ;;
  opaque-black)
    # Replace near-black with white; adjust fuzz to taste
    "${IM[@]}" "$INPUT" -fuzz "$FUZZ" -fill white -opaque black "$WORK"
    ;;
  *)
    die "Unsupported --recolor mode: $RECOLOR"
    ;;
esac

log "Output dir: $OUT_DIR"
[[ -n "$WEB_DIR" ]] && log "Web assets dir: $WEB_DIR"

make_square() {
  local src="$1"; local size="$2"; local dst="$3"
  # Resize within bounds then pad/crop to exact square with transparent background
  "${IM[@]}" "$src" -alpha on \
    -resize "${size}x${size}" \
    -background none -gravity center -extent "${size}x${size}" \
    -define png:color-type=6 "PNG32:$dst"
}

# 1) Main app icons (PNG)
log "Generating icon.png (1024x1024) and icon@2x.png (2048x2048)"
make_square "$WORK" 1024 "$OUT_DIR/icon.png"
make_square "$WORK" 2048 "$OUT_DIR/icon@2x.png"

# 2) Windows ICO
if [[ $SKIP_ICO -eq 0 ]]; then
  log "Generating icon.ico (Windows)"
  "${IM[@]}" "$WORK" -background none -define icon:auto-resize=256,128,64,48,32,16 "$OUT_DIR/icon.ico"
else
  log "Skipping .ico generation (--skip-ico)"
fi

# 3) macOS ICNS
if [[ $SKIP_ICNS -eq 0 ]]; then
  if command -v iconutil >/dev/null 2>&1; then
    TMPSET="$OUT_DIR/icon.iconset"
    log "Generating icon.icns (macOS) via iconutil"
    mkdir -p "$TMPSET"
    make_square "$WORK" 16   "$TMPSET/icon_16x16.png"
    make_square "$WORK" 32   "$TMPSET/icon_16x16@2x.png"
    make_square "$WORK" 32   "$TMPSET/icon_32x32.png"
    make_square "$WORK" 64   "$TMPSET/icon_32x32@2x.png"
    make_square "$WORK" 128  "$TMPSET/icon_128x128.png"
    make_square "$WORK" 256  "$TMPSET/icon_128x128@2x.png"
    make_square "$WORK" 256  "$TMPSET/icon_256x256.png"
    make_square "$WORK" 512  "$TMPSET/icon_256x256@2x.png"
    make_square "$WORK" 512  "$TMPSET/icon_512x512.png"
    make_square "$WORK" 1024 "$TMPSET/icon_512x512@2x.png"
    set +e
    iconutil -c icns "$TMPSET" -o "$OUT_DIR/icon.icns"
    rc=$?
    set -e
    if [[ $rc -ne 0 ]]; then
      log "iconutil failed (rc=$rc). Falling back to ImageMagick icns generation."
      # Fallback: compose a multi-size .icns using ImageMagick
      # Ensure IM recognizes icns format via prefix
      if "${IM[@]}" \
        "$TMPSET/icon_16x16.png" \
        "$TMPSET/icon_16x16@2x.png" \
        "$TMPSET/icon_32x32.png" \
        "$TMPSET/icon_32x32@2x.png" \
        "$TMPSET/icon_128x128.png" \
        "$TMPSET/icon_128x128@2x.png" \
        "$TMPSET/icon_256x256.png" \
        "$TMPSET/icon_256x256@2x.png" \
        "$TMPSET/icon_512x512.png" \
        "$TMPSET/icon_512x512@2x.png" \
        "icns:$OUT_DIR/icon.icns"; then
        log "Created icon.icns via ImageMagick fallback."
      else
        log "ImageMagick .icns fallback failed"
      fi
    fi
    rm -rf "$TMPSET"
  else
    log "iconutil not found; skipping .icns generation. (macOS only)"
  fi
else
  log "Skipping .icns generation (--skip-icns)"
fi

# 4) Tray/Menu bar template icons (monochrome recommended)
if [[ $SKIP_TRAY -eq 0 ]]; then
  log "Generating tray icons (iconTemplate.png, iconTemplate@2x.png, iconTemplateUpdate*)"
  make_square "$WORK" 22 "$OUT_DIR/iconTemplate.png"
  make_square "$WORK" 44 "$OUT_DIR/iconTemplate@2x.png"

  # Provide update variants as duplicates unless customized separately
  cp "$OUT_DIR/iconTemplate.png" "$OUT_DIR/iconTemplateUpdate.png"
  cp "$OUT_DIR/iconTemplate@2x.png" "$OUT_DIR/iconTemplateUpdate@2x.png"
else
  log "Skipping tray icons (--skip-tray)"
fi

# 5) Optional CLI web header logos
if [[ -n "$WEB_DIR" ]]; then
  log "Generating CLI web logos in $WEB_DIR"
  # Dark theme uses a light (white) logo; use WORK (post-recolor) to encourage white
  cp "$WORK" "$WEB_DIR/logo_dark.png"

  # Light theme uses a dark logo; prefer original input (assuming black). If already white, invert it.
  if [[ "$RECOLOR" == "white" ]]; then
    "${IM[@]}" "$WORK" -channel RGB -negate "$WEB_DIR/logo_light.png"
  else
    cp "$INPUT" "$WEB_DIR/logo_light.png"
  fi
fi

log "Done. Updated app icons in: $OUT_DIR"
[[ -n "$WEB_DIR" ]] && log "Updated CLI web logos in: $WEB_DIR"
