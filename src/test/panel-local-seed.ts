import { Prisma, type EntityFieldType, type PrismaClient } from "@prisma/client";
import { hash } from "bcrypt";
import { panelFixtureConfig, panelFixtureDefinitions, panelFixtureIds as i } from "./panel-local-fixture";
export const panelLocalScope = { organization: "local_panel_org", contract: "local_panel_contract", user: "local_panel_user", view: "local_panel_view", app: "local_panel_app" };
export async function seedLocalPanel(p: PrismaClient) {
  const host = new URL(process.env.DATABASE_URL!);
  if (!["127.0.0.1", "localhost"].includes(host.hostname) || host.pathname !== "/panel_daily_isolated") throw new Error("PANEL fixture requires its own isolated loopback database");
  const s = panelLocalScope;
  await p.organization.create({ data: { id: s.organization, name: "PANEL sintético aislado", slug: s.organization } });
  await p.user.create({ data: { id: s.user, email: "panel-local@example.invalid", name: "Usuario ficticio", passwordHash: await hash("local-panel-only-password", 10) } });
  await p.membership.create({ data: { organizationId: s.organization, userId: s.user, role: "ADMIN" } });
  await p.contract.create({ data: { id: s.contract, organizationId: s.organization, name: "PANEL — datos ficticios", code: "PANEL-LOCAL", slug: s.contract } });
  await p.externalApp.create({ data: { id: s.app, organizationId: s.organization, clientId: "panel-local-client", name: "Client local", slug: s.app } });
  for (const entity of panelFixtureDefinitions()) {
    await p.entityType.create({ data: { id: entity.id, contractId: s.contract, name: entity.name, slug: entity.id, nature: entity.id === i.events ? "TRANSACTION" : "MASTER" } });
    for (const field of entity.fields) {
      const { options, config, ...rest } = field;
      await p.entityField.create({ data: { ...rest, type: field.type as EntityFieldType, entityTypeId: entity.id, config: config === null ? Prisma.JsonNull : config as Prisma.InputJsonValue,
        searchable: field.id === i.identifier, options: { create: options as { id: string; label: string; value: string; isActive: boolean; sortOrder: number }[] } } });
    }
  }
  for (let n = 1; n <= 3; n++) await p.entityRecord.create({ data: { id: `local_person_${n}`, entityTypeId: i.workers, displayName: n === 1 ? "FICTICIO-001" : "FICTICIO-IGUAL",
    values: { create: [{ entityFieldId: i.identifier, textValue: n === 1 ? "FICTICIO-001" : "FICTICIO-IGUAL" }, { entityFieldId: i.name, textValue: n === 1 ? "Persona de ejemplo uno" : "Nombre ficticio coincidente" }] } } });
  for (const [code, quantity] of [["A", 2], ["B", 10], ["C", 7], ["D", null], ["E", 0]] as const) await p.entityRecord.create({ data: { id: `local_resource_${code}`, entityTypeId: i.resources, displayName: `Lote ficticio ${code}`,
    values: { create: [{ entityFieldId: i.code, textValue: `LOTE-FICTICIO-${code}` }, ...(quantity === null ? [] : [{ entityFieldId: i.initial, integerValue: quantity }])] } } });
  const rows = [[1, 1, "2026-11-17", "alpha", "A"], [2, 1, "2026-11-17", "alpha", "A"], [3, 2, "2026-11-17", "beta", "A"], [4, 3, "2026-11-17", "alpha", "B"],
    [5, 1, "2026-11-16", "alpha", "A"], [6, 2, "2026-11-16", "beta", "B"], [7, 2, "2026-11-16", "alpha", "B"], [8, 3, "2026-11-16", "alpha", "E"]] as const;
  for (const [n, person, date, status, resource] of rows) await p.entityRecord.create({ data: { id: `local_event_${n}`, entityTypeId: i.events, displayName: `Entrega ficticia ${n}`,
    outgoingRelations: { create: [{ sourceFieldId: i.worker, targetRecordId: `local_person_${person}` }, { sourceFieldId: i.resource, targetRecordId: `local_resource_${resource}` }] },
    values: { create: [{ entityFieldId: i.date, dateValue: new Date(`${date}T00:00:00Z`) }, { entityFieldId: i.status, textValue: status }] } } });
  await p.appView.create({ data: { id: s.view, contractId: s.contract, name: "Resumen diario y control histórico — ficticio", slug: "local-panel-view", type: "PANEL", config: panelFixtureConfig() as Prisma.InputJsonValue } });
  await p.userAppViewAccess.create({ data: { appViewId: s.view, contractId: s.contract, userId: s.user } });
}
