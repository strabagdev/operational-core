import { describe, expect, it } from "vitest";

import {
  DEFAULT_MONEY_CURRENCY,
  formatMoneyValue,
  getMoneyConfig,
} from "./money";

describe("money formatting", () => {
  it("uses CLP as the default money currency", () => {
    expect(getMoneyConfig(null).currency).toBe(DEFAULT_MONEY_CURRENCY);
    expect(getMoneyConfig({ money: {} }).currency).toBe("CLP");
  });

  it("formats CLP without decimals", () => {
    expect(formatMoneyValue("5269808713", "CLP")).toBe("$5.269.808.713");
  });

  it("formats USD with two decimals", () => {
    expect(formatMoneyValue("5269808713", "USD")).toBe(
      new Intl.NumberFormat("en-US", {
        currency: "USD",
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
        style: "currency",
      }).format(5269808713),
    );
  });

  it("formats EUR with two decimals", () => {
    expect(formatMoneyValue("5269808713", "EUR")).toBe(
      new Intl.NumberFormat("es-ES", {
        currency: "EUR",
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
        style: "currency",
      }).format(5269808713),
    );
  });

  it("formats UF with four decimal places when present", () => {
    expect(formatMoneyValue("1234.5678", "UF")).toBe("1.234,5678 UF");
  });
});
