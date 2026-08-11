import { Prisma } from "@prisma/client";

export const supportedMoneyCurrencies = ["CLP", "USD", "EUR", "UF"] as const;

export type MoneyCurrency = (typeof supportedMoneyCurrencies)[number];

export type MoneyConfig = {
  currency: MoneyCurrency;
};

export const DEFAULT_MONEY_CURRENCY: MoneyCurrency = "CLP";

const moneyCurrencyLabels: Record<MoneyCurrency, string> = {
  CLP: "Peso chileno (CLP)",
  USD: "Dólar estadounidense (USD)",
  EUR: "Euro (EUR)",
  UF: "Unidad de Fomento (UF)",
};

export function getMoneyCurrencyLabel(currency: MoneyCurrency) {
  return moneyCurrencyLabels[currency];
}

export function parseMoneyCurrency(value: unknown): MoneyCurrency {
  return typeof value === "string" && supportedMoneyCurrencies.includes(value as MoneyCurrency)
    ? (value as MoneyCurrency)
    : DEFAULT_MONEY_CURRENCY;
}

export function getMoneyConfig(config: unknown): MoneyConfig {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { currency: DEFAULT_MONEY_CURRENCY };
  }

  const money = (config as Record<string, unknown>).money;

  if (!money || typeof money !== "object" || Array.isArray(money)) {
    return { currency: DEFAULT_MONEY_CURRENCY };
  }

  return {
    currency: parseMoneyCurrency((money as Record<string, unknown>).currency),
  };
}

export function formatMoneyValue(
  value: Prisma.Decimal | number | string | null | undefined,
  currency: MoneyCurrency = DEFAULT_MONEY_CURRENCY,
) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const numericValue = value instanceof Prisma.Decimal ? value.toNumber() : Number(value);

  if (!Number.isFinite(numericValue)) {
    return "";
  }

  if (currency === "UF") {
    return `${new Intl.NumberFormat("es-CL", {
      maximumFractionDigits: 4,
      minimumFractionDigits: 0,
    }).format(numericValue)} UF`;
  }

  if (currency === "CLP") {
    return new Intl.NumberFormat("es-CL", {
      currency: "CLP",
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
      style: "currency",
    }).format(numericValue);
  }

  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "es-ES", {
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(numericValue);
}
