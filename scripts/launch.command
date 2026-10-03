#!/bin/bash
set -euo pipefail
IMAGE='/Volumes/Extreme SSD/Programming/Projects/Paradise Code IDE/ParadiseCodeBuild.sparsebundle'
if ! mount | grep -F ' on /Volumes/ParadiseCodeBuild (' >/dev/null; then
  if [ ! -d "$IMAGE" ]; then
    echo 'Connect the Paradise SSD. The build image could not be found.' >&2
    exit 1
  fi
  hdiutil attach "$IMAGE" -mountpoint /Volumes/ParadiseCodeBuild -nobrowse
fi
open '/Volumes/ParadiseCodeBuild/Applications/Paradise Code.app'
