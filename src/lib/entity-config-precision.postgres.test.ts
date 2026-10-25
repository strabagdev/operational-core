import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./prisma";
import { createEntityFieldWithOptions, getAuthorizedEntityType, getEntityFieldEditorInput, updateEntityFieldWithOptions } from "./entity-config";
import { getApiEntityDefinition } from "./api-entities";
import { serializeApiEntityDefinition } from "./api-entity-serializer";
import { validateEntityValues } from "./entity-records";
import { fieldInputName, parseFieldConfig } from "./field-validation";

const local = process.env.PRECISION_EDITOR_PG_INTEGRATION === "1" ? describe.sequential : describe.skip;
const prefix = "precision_editor_" + randomUUID().replaceAll("-", "");
const ids = { org: prefix + "_org", user: prefix + "_user", contract: prefix + "_contract", entity: prefix + "_entity", record: prefix + "_record" };
let connectedLocally = false;

async function editorInput(places?: string, type = "DECIMAL", key = "reading") {
  const form = new FormData();
  for (const [name, value] of Object.entries({ name: "Lectura sintética", key, type, required: "true", isActive: "true", displayShowInList: "true", displayShowInClient: "true" })) form.set(name, value);
  if (places !== undefined) form.set("validationDecimalPlaces", places);
  const request = new Request("https://synthetic.invalid/editor", { method: "POST", body: form });
  return getEntityFieldEditorInput(await request.formData());
}

local("decimal precision editor to PostgreSQL and API", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (url.hostname !== "127.0.0.1" || url.port !== "5432" || url.pathname !== "/opco_development" || decodeURIComponent(url.username) !== "opco_dev") throw new Error("LOCAL_DATABASE_REQUIRED");
    const [db] = await prisma.$queryRaw<Array<{ database: string; role: string; address: string }>>`SELECT current_database() AS database, current_user AS role, inet_server_addr()::text AS address`;
    expect(db).toEqual({ database: "opco_development", role: "opco_dev", address: "127.0.0.1/32" });
    connectedLocally = true;
    await prisma.organization.create({ data: { id: ids.org, name: "Precisión sintética", slug: ids.org } });
    await prisma.user.create({ data: { id: ids.user, email: ids.user + "@example.invalid", passwordHash: "synthetic-no-login" } });
    await prisma.membership.create({ data: { organizationId: ids.org, userId: ids.user, role: "ADMIN" } });
    await prisma.contract.create({ data: { id: ids.contract, organizationId: ids.org, code: ids.contract, name: "Precisión sintética", slug: ids.contract } });
    await prisma.entityType.create({ data: { id: ids.entity, contractId: ids.contract, name: "Lecturas sintéticas", slug: ids.entity } });
  });

  afterAll(async () => {
    try {
      if (connectedLocally) {
        await prisma.organization.deleteMany({ where: { id: ids.org } });
        await prisma.user.deleteMany({ where: { id: ids.user } });
        expect(await prisma.organization.count({ where: { id: ids.org } })).toBe(0);
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it("persists editor precision, rereads it through editor/API, and does not round existing values", async () => {
    const original = await editorInput();
    const field = await createEntityFieldWithOptions(ids.contract, ids.entity, ids.user, original.field, original.options);
    expect(field).not.toBeNull();
    await prisma.entityRecord.create({ data: { id: ids.record, entityTypeId: ids.entity, displayName: "Lectura sintética", values: { create: { entityFieldId: field!.id, decimalValue: "12.34" } } } });
    const input = await editorInput("1");
    await updateEntityFieldWithOptions(ids.contract, ids.entity, field!.id, ids.user, input.field, input.options);

    const editor = await getAuthorizedEntityType(ids.contract, ids.entity, ids.user);
    const stored = editor!.entityType.fields.find(value => value.id === field!.id)!;
    expect(parseFieldConfig(stored.config).validation).toMatchObject({ required: true, decimalPlaces: 1 });
    const api = await getApiEntityDefinition(ids.contract, ids.entity);
    const serialized = serializeApiEntityDefinition(api!);
    expect(serialized.fields.find(value => value.id === field!.id)!.config.validation.decimalPlaces).toBe(1);
    expect((await prisma.entityValue.findFirstOrThrow({ where: { entityFieldId: field!.id } })).decimalValue!.toString()).toBe("12.34");

    const accepted = new FormData(); accepted.set(fieldInputName(field!.id), "12.3");
    const rejected = new FormData(); rejected.set(fieldInputName(field!.id), "12.34");
    expect((await validateEntityValues({ fields: [stored], formData: accepted }))[0].decimalValue!.toString()).toBe("12.3");
    await expect(validateEntityValues({ fields: [stored], formData: rejected })).rejects.toMatchObject({
      name: "FieldValidationError", fieldErrors: { [field!.id]: ["Admite como máximo 1 decimales; no se redondea automáticamente."] },
    });
    // Editing again with the displayed rule must keep it, rather than drop it.
    const reopened = await editorInput(String(parseFieldConfig(stored.config).validation.decimalPlaces));
    await updateEntityFieldWithOptions(ids.contract, ids.entity, field!.id, ids.user, reopened.field, reopened.options);
    expect(parseFieldConfig((await prisma.entityField.findUniqueOrThrow({ where: { id: field!.id } })).config).validation.decimalPlaces).toBe(1);
  });

  it("creates with precision and rejects incompatible field types before mutation", async () => {
    const input = await editorInput("1", "DECIMAL", "created_with_precision");
    const field = await createEntityFieldWithOptions(ids.contract, ids.entity, ids.user, input.field, input.options);
    expect(parseFieldConfig(field!.config).validation.decimalPlaces).toBe(1);
    const count = await prisma.entityField.count({ where: { entityTypeId: ids.entity } });
    const invalid = await editorInput("1", "INTEGER", "invalid_integer_precision");
    await expect(createEntityFieldWithOptions(ids.contract, ids.entity, ids.user, invalid.field, invalid.options)).rejects.toThrow();
    expect(await prisma.entityField.count({ where: { entityTypeId: ids.entity } })).toBe(count);
  });
});
