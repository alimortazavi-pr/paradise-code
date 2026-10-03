#!/bin/bash
set -euo pipefail
IMAGE='/Volumes/Extreme SSD/Programming/Projects/Paradise Code IDE/ParadiseCodeBuild.sparsebundle'
if ! mount | grep -F ' on /Volumes/ParadiseCodeBuild (' >/dev/null; then
  hdiutil attach "$IMAGE" -mountpoint /Volumes/ParadiseCodeBuild -nobrowse
fi
open /Volumes/ParadiseCodeBuild/project
