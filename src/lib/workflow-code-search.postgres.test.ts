import { Prisma, PrismaClient } from "@prisma/client";
import { expect, it } from "vitest";
import { codeSearchRecordWhere, literalCodeSearchText } from "./workflow-code-search";

const url = process.env.OPCO_CODE_SEARCH_TEST_DATABASE_URL;
it.skipIf(!url)("PostgreSQL local matches the Client literal case-insensitive substring fixtures, without stored record values", async () => {
  const destination = new URL(url!);
  if (destination.hostname !== "127.0.0.1" || destination.port !== "5432" || destination.pathname !== "/opco_development" || destination.username !== "opco_dev") throw new Error("Only explicitly validated local PostgreSQL allowed");
  const db = new PrismaClient({ datasources: { db: { url } }, log: [{ emit: "event", level: "query" }] });
  try {
    const identity = await db.$queryRaw<{ database: string; role: string }[]>`SELECT current_database() AS database, current_user AS role`;
    expect(identity).toEqual([{ database: "opco_development", role: "opco_dev" }]);
    const rows = [
      ["a", "00.123.450-K"], ["b", "00.123.450-k"], ["c", "00123450K"],
      ["d", "PERSONA FICTICIA"], ["e", "Equipo_01%"], ["f", "EquipoX01X"], ["g", "Ñandú Ficticio"],
    ];
    const parameters: string[] = [];
    db.$on("query", event => { parameters.push(event.params); });
    for (const [query, expected] of [
      [" 00.123.450-k ", ["a", "b"]], ["00123450k", ["c"]], ["PERSONA", ["d"]],
      ["_01%", ["e"]], ["ñANDÚ", ["g"]], ["missing", []],
    ] as const) {
      const found = await db.$queryRaw<{ id: string }[]>(Prisma.sql`WITH fixture(id,value) AS (VALUES ${Prisma.join(rows.map(row => Prisma.sql`(${row[0]}, ${row[1]})`))}) SELECT id FROM fixture WHERE value ILIKE ${`%${literalCodeSearchText(query)}%`} ORDER BY id`);
      expect(found.map(row => row.id)).toEqual(expected);
      parameters.length = 0;
      expect(await db.entityRecord.findMany({ where: { entityTypeId: "code-reader-synthetic-nonexistent-entity", ...codeSearchRecordWhere("code-reader-synthetic-field", query) }, select: { id: true } })).toEqual([]);
      const pattern = `%${literalCodeSearchText(query)}%`;
      expect(parameters.some(text => text.includes(pattern) || text.includes(JSON.stringify(pattern).slice(1, -1)))).toBe(true);
    }
  } finally { await db.$disconnect(); }
});
