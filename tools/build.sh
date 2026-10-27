#!/usr/bin/env bash
# Builds two files from src/:
#   index.html         the website (full document, self-hosted fonts in fonts/)
#   dist/artifact.html the claude.ai artifact variant (fragment, Google Fonts), not committed
# Usage: tools/build.sh            SITE_URL=https://lngtrader.example/ tools/build.sh
set -euo pipefail
cd "$(dirname "$0")/.."
SITE_URL="${SITE_URL:-https://mcp10.github.io/lng-trader-game/}"
TITLE="LNG Trader Sim"
DESC="A browser game of physical LNG trading. Buy FOB cargoes at Sabine Pass, Ras Laffan, Gladstone and Bonny, charter steam, TFDE and two-stroke ships, route them through Panama, Suez or the Cape, sell DES into delivery windows, sign term contracts and hedge on TTF and JKM paper over 104 weeks."
GFONTS="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap"
mkdir -p dist
script(){ echo '<script>'; cat src/land.js src/model.js src/ui.js; echo '</script>'; }
{
cat <<HEAD
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${TITLE}</title>
<meta name="description" content="${DESC}">
<meta name="theme-color" content="#0b151d" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#edf2f5" media="(prefers-color-scheme: light)">
<link rel="canonical" href="${SITE_URL}">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${TITLE}">
<meta property="og:title" content="${TITLE}">
<meta property="og:description" content="${DESC}">
<meta property="og:url" content="${SITE_URL}">
<meta property="og:image" content="${SITE_URL}og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${TITLE}">
<meta name="twitter:description" content="${DESC}">
<meta name="twitter:image" content="${SITE_URL}og.png">
<link rel="preload" href="fonts/barlow-condensed-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/barlow-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="fonts/fonts.css">
HEAD
cat src/head.html
echo '</head>'
echo '<body>'
cat src/body.html
script
echo '</body>'
echo '</html>'
} > index.html
{
cat <<HEAD
<title>${TITLE}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="${GFONTS}">
HEAD
cat src/head.html src/body.html
script
} > dist/artifact.html
cat src/land.js src/model.js src/ui.js > dist/all.js && node --check dist/all.js
echo "built index.html ($(wc -c <index.html) bytes) and dist/artifact.html ($(wc -c <dist/artifact.html) bytes)"
