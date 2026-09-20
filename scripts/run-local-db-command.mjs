import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";

import { config as loadEnv } from "dotenv";

import { assertLocalDevelopmentDatabaseEnvironment } from "./local-development-target.mjs";

const command = process.argv[2];
const prismaArguments = command === "check"
  ? []
  : command === "migrate"
  ? ["prisma", "migrate", "deploy"]
  : command === "seed"
    ? ["prisma", "db", "seed"]
    : null;

if (!prismaArguments) {
  throw new Error("Use run-local-db-command.mjs with check, migrate or seed.");
}

if (!existsSync(".env.local")) {
  throw new Error(".env.local is required for local database commands.");
}

loadEnv({ path: ".env.local", override: true, quiet: true });
const target = assertLocalDevelopmentDatabaseEnvironment(process.env);

console.log(`Verified local database target: ${target.host}:${target.port}/${target.database}`);

if (command === "check") {
  process.exit(0);
}

const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", prismaArguments, {
  env: {
    ...process.env,
    OPCO_LOCAL_DATABASE_VERIFIED: "1",
  },
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
