import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cursor/Simple Browser often opens http://127.0.0.1:3000 while `next dev`
  // binds as localhost — without this, /_next chunks are blocked and the UI
  // never hydrates (dead Welcome / Sign in buttons).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
