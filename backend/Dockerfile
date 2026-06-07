# PixelStream backend — uses the official Puppeteer image which ships Chromium
# and all its system dependencies preinstalled (saves a lot of pain).
FROM ghcr.io/puppeteer/puppeteer:22.15.0

USER root
WORKDIR /app

# Install: (1) Xvfb = virtual display so Chrome runs HEADFUL (big anti-bot win),
# and (2) REAL Google Chrome stable — not just Chromium — because Chrome ships
# proprietary codecs and Chrome-only signals that reCAPTCHA looks for.
# The base image has an expired Google apt key that breaks `apt-get update`, so
# we drop that repo first; we install Chrome straight from the official .deb.
RUN rm -f /etc/apt/sources.list.d/google*.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends xvfb xauth wget ca-certificates \
    && wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && (dpkg -i /tmp/chrome.deb || apt-get install -y -f --no-install-recommends) \
    && rm -f /tmp/chrome.deb \
    && rm -rf /var/lib/apt/lists/*

# Install deps first (better layer caching)
COPY package.json ./
RUN npm install --omit=dev

# App code
COPY . .

# Use the real Google Chrome we just installed (not the bundled Chromium).
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_PATH=/usr/bin/google-chrome-stable

EXPOSE 8080
# Start Xvfb + node via entrypoint so Chrome runs headful and logs are visible.
CMD ["sh", "/app/entrypoint.sh"]
