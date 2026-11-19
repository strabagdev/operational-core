import { assertOperationalCommand, operationalCalendarKey, type OperationalCalendar, type OperationalDayCommand } from "./operational-calendar";
export function operationalDayContract(config: { operationalCalendar?: OperationalCalendar }) {
  return config.operationalCalendar ? { operationalDayContract: { version: 1 as const, calendarKey: operationalCalendarKey(config.operationalCalendar) } } : {};
}
export function verifyOperationalDay(config: { operationalCalendar?: OperationalCalendar }, input: {
  operationalDay?: unknown; eventOccurredAt?: unknown; dateValue?: unknown; date?: unknown;
  expectedUpdatedAt?: unknown; targetRecordId?: unknown; overwrite?: unknown;
}) {
  assertOperationalCommand(config.operationalCalendar, {
    operationalDay: input.operationalDay as OperationalDayCommand | undefined,
    eventOccurredAt: typeof input.eventOccurredAt === "string" ? input.eventOccurredAt : undefined,
    dateValue: typeof input.dateValue === "string" ? input.dateValue : input.date instanceof Date ? input.date.toISOString().slice(0, 10) : typeof input.date === "string" ? input.date : undefined,
    expectedUpdatedAt: input.expectedUpdatedAt, targetRecordId: input.targetRecordId, overwrite: input.overwrite === true,
  });
}
