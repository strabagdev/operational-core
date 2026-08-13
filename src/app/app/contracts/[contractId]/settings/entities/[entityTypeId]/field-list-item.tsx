import type React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getEntityFieldDeletionBlockedMessage,
  getEntityFieldDeletionSafetyFromCounts,
} from "@/lib/entity-config";
import { parseFieldConfig } from "@/lib/field-validation";
import {
  getFieldBehaviorBadges,
  getFieldTypeLabel,
  getFieldUseBadges,
  hasLimitedSupport,
} from "@/lib/field-list-ux";

import { FieldDeleteForm } from "./field-delete-form";
import { FieldToggleForm } from "./field-toggle-form";

export type FieldWithUsage = Parameters<typeof getFieldBehaviorBadges>[0] & {
  _count?: {
    auditChanges: number;
    values: number;
    relations: number;
  };
};

export function FieldListItem({
  contractId,
  entityTypeId,
  entityTypes,
  field,
  index,
  isLast,
  openHref,
  reorderAction,
  returnTo,
  deleteAction,
  toggleAction,
}: {
  contractId: string;
  entityTypeId: string;
  entityTypes: Array<{ id: string; name: string }>;
  field: FieldWithUsage;
  index: number;
  isLast: boolean;
  openHref: string;
  reorderAction: (
    contractId: string,
    entityTypeId: string,
    fieldId: string,
    direction: "up" | "down",
    formData: FormData,
  ) => void | Promise<void>;
  returnTo: string;
  deleteAction: (
    contractId: string,
    entityTypeId: string,
    fieldId: string,
    formData: FormData,
  ) => void | Promise<void>;
  toggleAction: (
    contractId: string,
    entityTypeId: string,
    fieldId: string,
    isActive: boolean,
    formData: FormData,
  ) => void | Promise<void>;
}) {
  const behaviorBadges = getFieldBehaviorBadges(field);
  const useBadges = getFieldUseBadges(field, entityTypes);
  const isPrimary = parseFieldConfig(field.config).display.primary === true;
  const toggleReturnTo = openHref.replace(/[?&]editField=[^&]+/, "");
  const deletionSafety = getEntityFieldDeletionSafetyFromCounts({
    auditChanges: field._count?.auditChanges ?? 0,
    relations: field._count?.relations ?? 0,
    values: field._count?.values ?? 0,
  });

  return (
    <Card className={field.isActive ? "" : "opacity-70"}>
      <CardContent className="grid gap-4 pt-6">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
          <div className="grid gap-3">
            <div className="grid gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">{field.name}</h3>
                <Badge variant={field.isActive ? "default" : "muted"}>
                  {field.isActive ? "Activo" : "Inactivo"}
                </Badge>
                {hasLimitedSupport(field.type) ? (
                  <Badge variant="muted">Soporte limitado</Badge>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                {getFieldTypeLabel(field.type)} · {field.key}
              </p>
              {field.description ? (
                <p className="text-sm text-muted-foreground">{field.description}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {behaviorBadges.map((badge) => (
                <Badge key={badge}>{badge}</Badge>
              ))}
              {useBadges.map((badge) => (
                <Badge key={badge} variant="outline">
                  {badge}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 md:justify-end">
            <FieldOrderButton
              direction="up"
              disabled={index === 0}
              entityTypeId={entityTypeId}
              contractId={contractId}
              fieldId={field.id}
              fieldName={field.name}
              reorderAction={reorderAction}
              returnTo={returnTo}
            />
            <FieldOrderButton
              direction="down"
              disabled={isLast}
              entityTypeId={entityTypeId}
              contractId={contractId}
              fieldId={field.id}
              fieldName={field.name}
              reorderAction={reorderAction}
              returnTo={returnTo}
            />
            <Button asChild size="sm" variant="outline">
              <Link href={openHref}>Editar</Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label={`Más acciones para ${field.name}`} size="icon" variant="outline">
                  <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                <div className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none">
                  <FieldToggleForm
                    action={toggleAction.bind(
                      null,
                      contractId,
                      entityTypeId,
                      field.id,
                      !field.isActive,
                    )}
                    isActive={field.isActive}
                    isPrimary={isPrimary}
                    returnTo={toggleReturnTo}
                  />
                </div>
                <DropdownMenuSeparator />
                <div className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none">
                  <FieldDeleteForm
                    action={deleteAction.bind(null, contractId, entityTypeId, field.id)}
                    blockedMessage={getEntityFieldDeletionBlockedMessage(deletionSafety)}
                    canDelete={deletionSafety.canDelete}
                    fieldName={field.name}
                    returnTo={toggleReturnTo}
                  />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FieldOrderButton({
  contractId,
  direction,
  disabled,
  entityTypeId,
  fieldId,
  fieldName,
  reorderAction,
  returnTo,
}: {
  contractId: string;
  direction: "up" | "down";
  disabled: boolean;
  entityTypeId: string;
  fieldId: string;
  fieldName: string;
  reorderAction: (
    contractId: string,
    entityTypeId: string,
    fieldId: string,
    direction: "up" | "down",
    formData: FormData,
  ) => void | Promise<void>;
  returnTo: string;
}) {
  const label =
    direction === "up"
      ? `Mover ${fieldName} hacia arriba`
      : `Mover ${fieldName} hacia abajo`;
  const Icon = direction === "up" ? ArrowUp : ArrowDown;

  return (
    <form
      action={reorderAction.bind(
        null,
        contractId,
        entityTypeId,
        fieldId,
        direction,
      )}
    >
      <input name="returnTo" type="hidden" value={returnTo} />
      <Button aria-label={label} disabled={disabled} size="icon" type="submit" variant="outline">
        <Icon aria-hidden="true" className="h-4 w-4" />
        <span className="sr-only">{label}</span>
      </Button>
    </form>
  );
}

function Badge({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "muted" | "outline";
}) {
  const className =
    variant === "outline"
      ? "border-border bg-background text-muted-foreground"
      : variant === "muted"
        ? "border-border bg-muted text-muted-foreground"
        : "border-transparent bg-secondary text-secondary-foreground";

  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}
