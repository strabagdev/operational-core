import type { NextConfig } from "next";

import { ENTITY_IMPORT_ACTION_BODY_SIZE_LIMIT_BYTES } from "./src/lib/entity-import-limits";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: ENTITY_IMPORT_ACTION_BODY_SIZE_LIMIT_BYTES,
    },
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
