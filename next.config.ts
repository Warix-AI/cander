import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cursor/Simple Browser often opens http://127.0.0.1:3000 while `next dev`
  // binds as localhost — without this, /_next chunks are blocked and the UI
  // never hydrates (dead Welcome / Sign in buttons).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Website Builder V2 uploads ./builder/*.mjs into the project sandbox at
  // runtime via fs — make sure the files are traced into the route bundle.
  outputFileTracingIncludes: {
    "/api/projects/[projectId]/build-jobs": ["./builder/**/*"],
    "/api/projects/[projectId]/build-jobs/[jobId]": ["./builder/**/*"],
  },
};

export default nextConfig;
