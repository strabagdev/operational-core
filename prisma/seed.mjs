import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123456", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@operational-core.local" },
    update: {
      name: "Administrator",
      passwordHash,
    },
    create: {
      name: "Administrator",
      email: "admin@operational-core.local",
      passwordHash,
    },
  });

  const organization = await prisma.organization.upsert({
    where: { slug: "demo" },
    update: {
      name: "Demo Organization",
    },
    create: {
      name: "Demo Organization",
      slug: "demo",
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_organizationId: {
        userId: admin.id,
        organizationId: organization.id,
      },
    },
    update: {
      role: "ADMIN",
    },
    create: {
      userId: admin.id,
      organizationId: organization.id,
      role: "ADMIN",
    },
  });

  const contract = await prisma.contract.upsert({
    where: {
      organizationId_slug: {
        organizationId: organization.id,
        slug: "demo-contract",
      },
    },
    update: {
      name: "Demo Contract",
      code: "DEMO-001",
      description: "Contrato demo para preparar el contexto base de la plataforma.",
      status: "ACTIVE",
    },
    create: {
      organizationId: organization.id,
      name: "Demo Contract",
      code: "DEMO-001",
      description: "Contrato demo para preparar el contexto base de la plataforma.",
      status: "ACTIVE",
      slug: "demo-contract",
    },
  });

  const personas = await upsertEntityType(contract.id, {
    name: "Personas",
    slug: "personas",
    description: "Personas asociadas al contrato.",
    icon: "users",
  });
  const equipos = await upsertEntityType(contract.id, {
    name: "Equipos",
    slug: "equipos",
    description: "Equipos y activos operacionales del contrato.",
    icon: "package",
  });
  const empresas = await upsertEntityType(contract.id, {
    name: "Empresas",
    slug: "empresas",
    description: "Empresas vinculadas a la operación.",
    icon: "building",
  });
  const documentos = await upsertEntityType(contract.id, {
    name: "Documentos",
    slug: "documentos",
    description: "Documentos operacionales del contrato.",
    icon: "file-text",
  });

  await upsertEntityField(personas.id, {
    name: "Nombre",
    key: "nombre",
    type: "TEXT",
    required: true,
    searchable: true,
    sortOrder: 1,
    config: {
      display: {
        primary: true,
        showInList: true,
        listOrder: 1,
      },
    },
  });
  await upsertEntityField(personas.id, {
    name: "RUT",
    key: "rut",
    type: "TEXT",
    required: true,
    isUnique: true,
    searchable: true,
    sortOrder: 2,
    config: {
      display: {
        showInList: true,
        listOrder: 2,
      },
    },
  });
  await upsertEntityField(personas.id, {
    name: "Cargo",
    key: "cargo",
    type: "TEXT",
    searchable: true,
    sortOrder: 3,
    config: {
      display: {
        showInList: true,
        listOrder: 3,
      },
    },
  });
  const personaEstado = await upsertEntityField(personas.id, {
    name: "Estado",
    key: "estado",
    type: "SELECT",
    required: true,
    searchable: true,
    sortOrder: 4,
    config: {
      display: {
        showInList: true,
        listOrder: 4,
      },
    },
  });
  const personaEmpresa = await upsertEntityField(personas.id, {
    name: "Empresa",
    key: "empresa",
    type: "RELATION",
    sortOrder: 5,
    config: {
      targetEntityTypeId: empresas.id,
      relationKind: "ONE",
    },
  });

  await upsertOption(personaEstado.id, {
    label: "Activo",
    value: "activo",
    sortOrder: 1,
  });
  await upsertOption(personaEstado.id, {
    label: "Inactivo",
    value: "inactivo",
    sortOrder: 2,
  });

  await upsertEntityField(equipos.id, {
    name: "Código",
    key: "codigo",
    type: "TEXT",
    required: true,
    isUnique: true,
    searchable: true,
    sortOrder: 1,
  });
  await upsertEntityField(equipos.id, {
    name: "Tipo",
    key: "tipo",
    type: "TEXT",
    searchable: true,
    sortOrder: 2,
  });
  await upsertEntityField(equipos.id, {
    name: "Marca",
    key: "marca",
    type: "TEXT",
    searchable: true,
    sortOrder: 3,
  });
  await upsertEntityField(equipos.id, {
    name: "Modelo",
    key: "modelo",
    type: "TEXT",
    searchable: true,
    sortOrder: 4,
  });
  const equipoEstado = await upsertEntityField(equipos.id, {
    name: "Estado",
    key: "estado",
    type: "SELECT",
    required: true,
    searchable: true,
    sortOrder: 5,
  });
  const equipoEmpresa = await upsertEntityField(equipos.id, {
    name: "Empresa propietaria",
    key: "empresa_propietaria",
    type: "RELATION",
    sortOrder: 6,
    config: {
      targetEntityTypeId: empresas.id,
      relationKind: "ONE",
    },
  });

  await upsertOption(equipoEstado.id, {
    label: "Operativo",
    value: "operativo",
    sortOrder: 1,
  });
  await upsertOption(equipoEstado.id, {
    label: "Fuera de servicio",
    value: "fuera_de_servicio",
    sortOrder: 2,
  });

  const documentoEquipo = await upsertEntityField(documentos.id, {
    name: "Equipos relacionados",
    key: "equipos_relacionados",
    type: "RELATION",
    multiple: true,
    sortOrder: 1,
    config: {
      targetEntityTypeId: equipos.id,
      relationKind: "MANY",
    },
  });

  const personaDemo = await upsertRecord(personas.id, "María González", {
    nombre: { textValue: "María González" },
    rut: { textValue: "12.345.678-9" },
    cargo: { textValue: "Supervisora de operaciones" },
    estado: { textValue: "activo" },
  });
  const equipoDemo = await upsertRecord(equipos.id, "EQ-001", {
    codigo: { textValue: "EQ-001" },
    tipo: { textValue: "Camioneta" },
    marca: { textValue: "Toyota" },
    modelo: { textValue: "Hilux" },
    estado: { textValue: "operativo" },
  });
  const empresaDemo = await upsertRecord(empresas.id, "Empresa demo", {});
  const documentoDemo = await upsertRecord(documentos.id, "Documento demo", {});

  await syncSeedRelations(personaDemo.id, personaEmpresa.id, [empresaDemo.id]);
  await syncSeedRelations(equipoDemo.id, equipoEmpresa.id, [empresaDemo.id]);
  await syncSeedRelations(documentoDemo.id, documentoEquipo.id, [equipoDemo.id]);

  await ensureSeedAuditEvent({
    contractId: contract.id,
    entityTypeId: personas.id,
    entityRecordId: personaDemo.id,
    actorUserId: admin.id,
    action: "RECORD_CREATED",
    summary: "Creó Personas María González",
    changes: [
      {
        entityFieldId: personaEmpresa.id,
        fieldName: "Empresa",
        oldValue: null,
        newValue: relationAuditValue(empresaDemo, empresas),
      },
    ],
  });
  await ensureSeedAuditEvent({
    contractId: contract.id,
    entityTypeId: equipos.id,
    entityRecordId: equipoDemo.id,
    actorUserId: admin.id,
    action: "RELATION_ADDED",
    summary: "Agregó relaciones en Equipos EQ-001",
    changes: [
      {
        entityFieldId: equipoEmpresa.id,
        fieldName: "Empresa propietaria",
        oldValue: null,
        newValue: relationAuditValue(empresaDemo, empresas),
      },
    ],
  });
  await ensureSeedAuditEvent({
    contractId: contract.id,
    entityTypeId: documentos.id,
    entityRecordId: documentoDemo.id,
    actorUserId: admin.id,
    action: "RELATION_ADDED",
    summary: "Agregó relaciones en Documentos Documento demo",
    changes: [
      {
        entityFieldId: documentoEquipo.id,
        fieldName: "Equipos relacionados",
        oldValue: null,
        newValue: relationAuditValue(equipoDemo, equipos),
      },
    ],
  });
}

async function upsertEntityType(contractId, data) {
  return prisma.entityType.upsert({
    where: {
      contractId_slug: {
        contractId,
        slug: data.slug,
      },
    },
    update: {
      name: data.name,
      description: data.description,
      icon: data.icon,
      isActive: true,
    },
    create: {
      contractId,
      name: data.name,
      slug: data.slug,
      description: data.description,
      icon: data.icon,
      isActive: true,
    },
  });
}

async function upsertEntityField(entityTypeId, data) {
  const existing = await prisma.entityField.findUnique({
    where: {
      entityTypeId_key: {
        entityTypeId,
        key: data.key,
      },
    },
  });
  const config = mergeJsonConfig(existing?.config, data.config);

  if (existing) {
    return prisma.entityField.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        description: data.description ?? null,
        type: data.type,
        required: data.required ?? false,
        isUnique: data.isUnique ?? false,
        searchable: data.searchable ?? false,
        multiple: data.multiple ?? false,
        sortOrder: data.sortOrder,
        ...(config === undefined ? {} : { config }),
        isActive: true,
      },
    });
  }

  return prisma.entityField.create({
    data: {
      entityTypeId,
      name: data.name,
      key: data.key,
      description: data.description ?? null,
      type: data.type,
      required: data.required ?? false,
      isUnique: data.isUnique ?? false,
      searchable: data.searchable ?? false,
      multiple: data.multiple ?? false,
      sortOrder: data.sortOrder,
      ...(config === undefined ? {} : { config }),
      isActive: true,
    },
  });
}

function mergeJsonConfig(existingConfig, nextConfig) {
  if (!nextConfig) {
    return existingConfig ?? undefined;
  }

  if (!existingConfig || typeof existingConfig !== "object" || Array.isArray(existingConfig)) {
    return nextConfig;
  }

  return {
    ...existingConfig,
    ...nextConfig,
    validation: nextConfig.validation ?? existingConfig.validation,
    display: nextConfig.display ?? existingConfig.display,
  };
}

async function upsertOption(entityFieldId, data) {
  return prisma.fieldOption.upsert({
    where: {
      entityFieldId_value: {
        entityFieldId,
        value: data.value,
      },
    },
    update: {
      label: data.label,
      sortOrder: data.sortOrder,
      isActive: true,
    },
    create: {
      entityFieldId,
      label: data.label,
      value: data.value,
      sortOrder: data.sortOrder,
      isActive: true,
    },
  });
}

async function upsertRecord(entityTypeId, displayName, valuesByKey) {
  const existing = await prisma.entityRecord.findFirst({
    where: {
      entityTypeId,
      displayName,
    },
    select: {
      id: true,
    },
  });
  const record = existing
    ? await prisma.entityRecord.update({
        where: { id: existing.id },
        data: {
          displayName,
        },
      })
    : await prisma.entityRecord.create({
        data: {
          entityTypeId,
          displayName,
        },
      });

  const fields = await prisma.entityField.findMany({
    where: {
      entityTypeId,
      key: { in: Object.keys(valuesByKey) },
    },
  });

  await prisma.entityValue.deleteMany({
    where: { entityRecordId: record.id },
  });

  if (fields.length > 0) {
    await prisma.entityValue.createMany({
      data: fields.map((field) => ({
        entityRecordId: record.id,
        entityFieldId: field.id,
        textValue: valuesByKey[field.key].textValue ?? null,
        integerValue: valuesByKey[field.key].integerValue ?? null,
        decimalValue: valuesByKey[field.key].decimalValue ?? null,
        booleanValue: valuesByKey[field.key].booleanValue ?? null,
        dateValue: valuesByKey[field.key].dateValue ?? null,
        jsonValue: valuesByKey[field.key].jsonValue ?? undefined,
      })),
    });
  }

  return record;
}

async function syncSeedRelations(sourceRecordId, sourceFieldId, targetRecordIds) {
  await prisma.entityRelation.deleteMany({
    where: {
      sourceRecordId,
      sourceFieldId,
      targetRecordId: { notIn: targetRecordIds },
    },
  });

  for (const targetRecordId of targetRecordIds) {
    await prisma.entityRelation.upsert({
      where: {
        sourceRecordId_sourceFieldId_targetRecordId: {
          sourceRecordId,
          sourceFieldId,
          targetRecordId,
        },
      },
      update: {},
      create: {
        sourceRecordId,
        sourceFieldId,
        targetRecordId,
      },
    });
  }
}

async function ensureSeedAuditEvent(data) {
  const existing = await prisma.auditEvent.findFirst({
    where: {
      action: data.action,
      entityRecordId: data.entityRecordId,
      summary: data.summary,
    },
    select: { id: true },
  });

  if (existing) {
    return existing;
  }

  return prisma.auditEvent.create({
    data: {
      contractId: data.contractId,
      entityTypeId: data.entityTypeId,
      entityRecordId: data.entityRecordId,
      actorUserId: data.actorUserId,
      action: data.action,
      summary: data.summary,
      metadata: { seed: true },
      changes: {
        create: data.changes.map((change) => ({
          entityFieldId: change.entityFieldId,
          fieldName: change.fieldName,
          oldValue: change.oldValue,
          newValue: change.newValue,
        })),
      },
    },
  });
}

function relationAuditValue(record, entityType) {
  return {
    id: record.id,
    displayName: record.displayName,
    entityTypeId: entityType.id,
    entityTypeName: entityType.name,
  };
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
