import { config as loadEnv } from "dotenv";

import { defineConfig } from "prisma/config";

loadEnv({ path: [".env.local", ".env"], override: false, quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "node prisma/seed.mjs",
  },
});
