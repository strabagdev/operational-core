import { Prisma, type ContractStatus } from "@prisma/client";
import { z } from "zod";

import { createAuditEvent } from "./audit";
import { deleteContractConfirmationText } from "./contract-deletion";
import { contractStatusLabels } from "./contract-status";
import { slugify } from "./format";
import { prisma } from "./prisma";

export { contractStatusLabels };

export const contractFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio."),
  code: z.string().trim().min(1, "El código es obligatorio."),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
  organizationId: z.string().trim().optional(),
});

export type ContractFormInput = z.infer<typeof contractFormSchema>;

export class ContractAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractAdminError";
  }
}

export function getContractFormInput(formData: FormData): ContractFormInput {
  return contractFormSchema.parse({
    name: formData.get("name"),
    code: formData.get("code"),
    status: formData.get("status") || "ACTIVE",
    organizationId: formData.get("organizationId") || undefined,
  });
}

export function contractAdminFriendlyError(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Revisa los datos del contrato.";
  }

  if (error instanceof ContractAdminError) {
    return error.message;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return "Ya existe un contrato con ese código en esta organización.";
  }

  return "No se pudo completar la operación.";
}

export async function getContractAdministration({
  userId,
  query,
  status = "ACTIVE",
}: {
  userId: string;
  query?: string;
  status?: ContractStatus | "ALL";
}) {
  const organizations = await getAdminOrganizations(userId);
  const organizationIds = organizations.map((organization) => organization.id);

  if (organizationIds.length === 0) {
    return { organizations, contracts: [] };
  }

  const normalizedQuery = query?.trim();
  const contracts = await prisma.contract.findMany({
    where: {
      organizationId: { in: organizationIds },
      ...(status !== "ALL" ? { status } : {}),
      ...(normalizedQuery
        ? {
            OR: [
              { name: { contains: normalizedQuery, mode: "insensitive" } },
              { code: { contains: normalizedQuery, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { organization: true },
    orderBy: [{ organization: { name: "asc" } }, { updatedAt: "desc" }],
  });

  return { organizations, contracts };
}

export async function createContractForAdmin(userId: string, input: ContractFormInput) {
  const organization = await resolveAdminOrganization(userId, input.organizationId);
  const code = input.code.trim();
  const name = input.name.trim();

  await ensureUniqueContractCode({
    organizationId: organization.id,
    code,
  });

  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.create({
      data: {
        organizationId: organization.id,
        name,
        code,
        slug: await uniqueContractSlug(tx, organization.id, name),
        status: input.status,
      },
      include: { organization: true },
    });

    await createAuditEvent(tx, {
      contractId: contract.id,
      actorUserId: userId,
      action: "CONTRACT_CREATED",
      summary: `Creó contrato ${contract.name}`,
      metadata: {
        contractId: contract.id,
        contractName: contract.name,
        organizationId: organization.id,
        organizationName: organization.name,
      },
      changes: [
        { fieldName: "Nombre", oldValue: Prisma.JsonNull, newValue: contract.name },
        { fieldName: "Código", oldValue: Prisma.JsonNull, newValue: contract.code },
        { fieldName: "Estado", oldValue: Prisma.JsonNull, newValue: contract.status },
      ],
    });

    return contract;
  });
}

export async function updateContractForAdmin(
  userId: string,
  contractId: string,
  input: ContractFormInput,
) {
  const contract = await getAdminContract(userId, contractId);

  if (!contract) {
    return null;
  }

  const code = input.code.trim();
  const name = input.name.trim();

  await ensureUniqueContractCode({
    organizationId: contract.organizationId,
    code,
    excludeContractId: contract.id,
  });

  const statusChanged = contract.status !== input.status;
  const detailChanged = contract.name !== name || contract.code !== code;

  if (!statusChanged && !detailChanged) {
    return contract;
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.contract.update({
      where: { id: contract.id },
      data: {
        name,
        code,
        status: input.status,
      },
      include: { organization: true },
    });

    if (detailChanged) {
      await createAuditEvent(tx, {
        contractId: contract.id,
        actorUserId: userId,
        action: "CONTRACT_UPDATED",
        summary: `Actualizó contrato ${updated.name}`,
        metadata: {
          contractId: contract.id,
          organizationId: contract.organizationId,
        },
        changes: [
          { fieldName: "Nombre", oldValue: contract.name, newValue: updated.name },
          { fieldName: "Código", oldValue: contract.code, newValue: updated.code },
        ].filter((change) => change.oldValue !== change.newValue),
      });
    }

    if (statusChanged) {
      await createAuditEvent(tx, {
        contractId: contract.id,
        actorUserId: userId,
        action: "CONTRACT_STATUS_CHANGED",
        summary: `Cambió estado de contrato ${updated.name}`,
        metadata: {
          contractId: contract.id,
          organizationId: contract.organizationId,
        },
        changes: [
          { fieldName: "Estado", oldValue: contract.status, newValue: updated.status },
        ],
      });
    }

    return updated;
  });
}

export async function archiveContractForAdmin(userId: string, contractId: string) {
  const contract = await getAdminContract(userId, contractId);

  if (!contract) {
    return null;
  }

  if (contract.status === "ARCHIVED") {
    return contract;
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.contract.update({
      where: { id: contract.id },
      data: { status: "ARCHIVED" },
      include: { organization: true },
    });

    await createAuditEvent(tx, {
      contractId: contract.id,
      actorUserId: userId,
      action: "CONTRACT_ARCHIVED",
      summary: `Archivó contrato ${updated.name}`,
      metadata: {
        contractId: contract.id,
        organizationId: contract.organizationId,
        archivedInsteadOfDelete: true,
      },
      changes: [{ fieldName: "Estado", oldValue: contract.status, newValue: "ARCHIVED" }],
    });

    return updated;
  });
}

export async function restoreContractForAdmin(userId: string, contractId: string) {
  const contract = await getAdminContract(userId, contractId);

  if (!contract) {
    return null;
  }

  if (contract.status !== "ARCHIVED") {
    return contract;
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.contract.update({
      where: { id: contract.id },
      data: { status: "ACTIVE" },
      include: { organization: true },
    });

    await createAuditEvent(tx, {
      contractId: contract.id,
      actorUserId: userId,
      action: "CONTRACT_RESTORED",
      summary: `Restauró contrato ${updated.name}`,
      metadata: {
        contractId: contract.id,
        organizationId: contract.organizationId,
      },
      changes: [{ fieldName: "Estado", oldValue: "ARCHIVED", newValue: "ACTIVE" }],
    });

    return updated;
  });
}

export async function deleteContractForAdmin(
  userId: string,
  contractId: string,
  confirmationText: string,
) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.findFirst({
      where: {
        id: contractId,
        organization: {
          memberships: {
            some: {
              userId,
              role: "ADMIN",
            },
          },
        },
      },
      include: { organization: true },
    });

    if (!contract) {
      return null;
    }

    if (contract.status !== "ARCHIVED") {
      throw new ContractAdminError("Solo puedes eliminar contratos archivados.");
    }

    if (confirmationText.trim() !== deleteContractConfirmationText(contract.code)) {
      throw new ContractAdminError("La confirmación no coincide.");
    }

    await deleteContractDependencies(tx, contract.id);
    await tx.contract.delete({ where: { id: contract.id } });

    return contract;
  });
}

async function getAdminOrganizations(userId: string) {
  return prisma.organization.findMany({
    where: {
      memberships: {
        some: {
          userId,
          role: "ADMIN",
        },
      },
    },
    orderBy: { name: "asc" },
  });
}

async function resolveAdminOrganization(userId: string, organizationId?: string) {
  const organizations = await getAdminOrganizations(userId);

  if (organizations.length === 0) {
    throw new ContractAdminError("No tienes permisos para administrar contratos.");
  }

  if (!organizationId && organizations.length === 1) {
    return organizations[0];
  }

  const organization = organizations.find((item) => item.id === organizationId);

  if (!organization) {
    throw new ContractAdminError("La organización no está disponible para tu usuario.");
  }

  return organization;
}

async function deleteContractDependencies(tx: Prisma.TransactionClient, contractId: string) {
  await tx.auditChange.deleteMany({
    where: {
      OR: [
        { auditEvent: { contractId } },
        { entityField: { entityType: { contractId } } },
      ],
    },
  });
  await tx.auditEvent.deleteMany({ where: { contractId } });
  await tx.entityRelation.deleteMany({
    where: {
      OR: [
        { sourceRecord: { entityType: { contractId } } },
        { targetRecord: { entityType: { contractId } } },
        { sourceField: { entityType: { contractId } } },
      ],
    },
  });
  await tx.entityValue.deleteMany({
    where: {
      OR: [
        { entityRecord: { entityType: { contractId } } },
        { entityField: { entityType: { contractId } } },
      ],
    },
  });
  await tx.entityRecord.deleteMany({ where: { entityType: { contractId } } });
  await tx.fieldOption.deleteMany({ where: { entityField: { entityType: { contractId } } } });
  await tx.entityField.deleteMany({ where: { entityType: { contractId } } });
  await tx.entityType.deleteMany({ where: { contractId } });
}

async function getAdminContract(userId: string, contractId: string) {
  return prisma.contract.findFirst({
    where: {
      id: contractId,
      organization: {
        memberships: {
          some: {
            userId,
            role: "ADMIN",
          },
        },
      },
    },
    include: { organization: true },
  });
}

async function ensureUniqueContractCode({
  organizationId,
  code,
  excludeContractId,
}: {
  organizationId: string;
  code: string;
  excludeContractId?: string;
}) {
  const existing = await prisma.contract.findFirst({
    where: {
      organizationId,
      code,
      ...(excludeContractId ? { id: { not: excludeContractId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new ContractAdminError("Ya existe un contrato con ese código en esta organización.");
  }
}

async function uniqueContractSlug(
  tx: Prisma.TransactionClient,
  organizationId: string,
  name: string,
) {
  const base = slugify(name) || "contrato";
  let slug = base;
  let suffix = 2;

  while (
    await tx.contract.findFirst({
      where: { organizationId, slug },
      select: { id: true },
    })
  ) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}
