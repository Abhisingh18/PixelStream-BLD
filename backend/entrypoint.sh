#!/bin/sh
# Start a virtual display, then run the app in the foreground so Chrome can
# launch headful and node's logs go straight to the container's stdout.
Xvfb :99 -screen 0 1280x720x24 -nolisten tcp &
export DISPLAY=:99
exec node server.js
