import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma loads its query engine (a native .node library) by computed path at runtime, which
  // file tracing can't follow from the custom output in src/generated/prisma. Include the
  // engine in every server route's trace — registration, auth, invoices, and the rest all
  // reach Prisma through Server Actions, pages, or route handlers.
  outputFileTracingIncludes: {
    "/**": ["./src/generated/prisma/*.node"],
  },
};

export default nextConfig;
