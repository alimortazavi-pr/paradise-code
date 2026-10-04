"""Finder layout generated without Apple Events or Finder automation permission."""
import os
from pathlib import Path

app = Path(os.environ['CARGO_TARGET_DIR']) / 'release/bundle/macos/Paradise Code.app'
files = [str(app)]
symlinks = {'Applications': '/Applications'}
# Do not add FinderInfo attributes to the signed app bundle.
hide_extensions = []
icon = str(Path(os.environ['PARADISE_ROOT']) / 'icons/icon.icns')
format = 'UDZO'
filesystem = 'HFS+'
window_rect = ((200, 180), (640, 280))
icon_locations = {'Paradise Code.app': (140, 120), 'Applications': (500, 120)}
icon_size = 96
text_size = 14
background = 'builtin-arrow'
default_view = 'icon-view'
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
