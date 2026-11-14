import { describe, expect, it, vi } from "vitest";
vi.mock("./prisma", () => ({ prisma: {} }));
import { parseOfflineManifestRequest } from "./offline-manifest";

const v2 = "version=2&nonce=event_0123456789abcdef&readRepresentationVersion=1&receiptVersion=1&storagePolicyVersion=1";

describe("offline manifest negotiation query", () => {
  it("keeps the implicit and explicit v1 representation unchanged", () => {
    expect(parseOfflineManifestRequest(new URLSearchParams())).toEqual({ version: 1, appViewIds: [] });
    expect(parseOfflineManifestRequest(new URLSearchParams("version=1&month=2026-11"))).toEqual({ version: 1, month: "2026-11", appViewIds: [] });
  });

  it("opts in explicitly and retains exact context and sorted IDs", () => {
    expect(parseOfflineManifestRequest(new URLSearchParams(v2 + "&date=2026-11-13&month=2026-11&appViewId=b&appViewId=a"))).toEqual({
      version: 2, date: "2026-11-13", month: "2026-11", appViewIds: ["a", "b"],
      negotiation: { nonce: "event_0123456789abcdef", readRepresentationVersion: 1, receiptVersion: 1, storagePolicyVersion: 1, expected: {} },
    });
  });

  it("parses bounded unsupported versions for an explicit incompatibility response", () => {
    const result = parseOfflineManifestRequest(new URLSearchParams(v2.replace("receiptVersion=1", "receiptVersion=2")));
    expect(result).toMatchObject({ version: 2, negotiation: { receiptVersion: 2 } });
  });

  it("binds optional previous scope, revision, epoch and definition expectations", () => {
    const digest = "a".repeat(64);
    expect(parseOfflineManifestRequest(new URLSearchParams(v2 + `&expectedScopeFingerprint=${digest}&expectedManifestVectorRevision=${digest}&expectedEpoch=epoch-local&expectedDefinitionsRevision=${digest}`)))
      .toMatchObject({ negotiation: { expected: { scopeFingerprint: digest, manifestVectorRevision: digest, epoch: "epoch-local", definitionsRevision: digest } } });
  });

  it.each([
    v2 + "&nonce=other_0123456789abcdef", v2.replace("nonce=event_0123456789abcdef", "nonce=short"),
    v2.replace("nonce=event_0123456789abcdef", "nonce=" + "x".repeat(129)),
    v2.replace("nonce=event_0123456789abcdef", "nonce=event%20unsafe%20nonce"),
    v2.replace("receiptVersion=1", "receiptVersion=0"), v2.replace("receiptVersion=1", "receiptVersion=01"),
    v2.replace("receiptVersion=1", "receiptVersion=1.5"), v2.replace("receiptVersion=1", "receiptVersion=65536"),
    v2.replace("&storagePolicyVersion=1", ""), v2 + "&expectedEpoch=", v2 + "&expectedEpoch=bad%20epoch",
    v2 + "&expectedScopeFingerprint=not-a-digest", v2 + "&expectedDefinitionsRevision=", v2 + "&unknown=1",
    v2 + "&version=2", v2 + "&date=2026-02-29", v2 + "&appViewId=a&appViewId=a",
    v2.replace("version=2", "version=1"), v2.replace("version=2&", ""),
  ])("rejects malformed or ambiguous negotiation: %s", query => {
    expect(() => parseOfflineManifestRequest(new URLSearchParams(query))).toThrow();
  });
});
