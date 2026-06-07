export const metadata = {
  title: "PixelStream — Remote Browser",
  description: "Control a headless Chromium running in Docker, from your browser",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
