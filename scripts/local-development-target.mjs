export const localDevelopmentDatabase = Object.freeze({
  host: "127.0.0.1",
  port: "55432",
  database: "opco_development",
  user: "opco_dev",
});

export function assertLocalDevelopmentDatabaseUrl(value, variableName = "DATABASE_URL") {
  if (!value) {
    throw new Error(`${variableName} is required for local database commands.`);
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL URL.`);
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const expected = localDevelopmentDatabase;
  const matches = (url.protocol === "postgresql:" || url.protocol === "postgres:")
    && url.hostname === expected.host
    && url.port === expected.port
    && database === expected.database
    && decodeURIComponent(url.username) === expected.user;

  if (!matches) {
    throw new Error(
      `${variableName} is not the authorized local target `
      + `${expected.host}:${expected.port}/${expected.database} as ${expected.user}.`,
    );
  }

  return {
    database,
    host: url.hostname,
    port: url.port,
    user: decodeURIComponent(url.username),
  };
}

/** @param {Record<string, string | undefined>} env */
export function assertLocalDevelopmentDatabaseEnvironment(env = process.env) {
  const target = assertLocalDevelopmentDatabaseUrl(env.DATABASE_URL, "DATABASE_URL");

  for (const variableName of ["DIRECT_URL", "PANEL_PG_INTEGRATION_DATABASE_URL"]) {
    if (env[variableName]) {
      assertLocalDevelopmentDatabaseUrl(env[variableName], variableName);
    }
  }

  return target;
}
