import { describe, expect, it } from "vitest";

describe("AppView editor client options", () => {
  it("load without a server database environment", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;

    try {
      delete process.env.DATABASE_URL;
      const options = await import("./app-view-editor-options");

      expect(options.appViewTypeOptions.map(({ value }) => value)).toContain("WORKFLOW");
      expect(options.appViewWorkflowOptions.map(({ value }) => value)).toContain("attendance");
      expect(options.suggestedAppViewSlug("Registro de Asistencia")).toBe("registro-de-asistencia");
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
  });
});
