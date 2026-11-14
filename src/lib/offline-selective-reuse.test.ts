import {describe,it,expect} from "vitest";
import {selectiveReuseEnabled} from "./offline-selective-reuse";
describe("selective reuse server gate",()=>{
 it("is disabled by default and requires an exact contract opt-in",()=>{
  expect(selectiveReuseEnabled("a",{})).toBe(false);
  const env={OPCO_OFFLINE_REUSE_POLICY:"attendance-runtime-v1",OPCO_OFFLINE_REUSE_CONTRACT_IDS:"a,b"};
  expect(selectiveReuseEnabled("a",env)).toBe(true);expect(selectiveReuseEnabled("c",env)).toBe(false);
  expect(selectiveReuseEnabled("a",{...env,OPCO_OFFLINE_REUSE_CONTRACT_IDS:"*"})).toBe(false);
  expect(selectiveReuseEnabled("a",{...env,OPCO_OFFLINE_REUSE_CONTRACT_IDS:"a,"})).toBe(false);
 });
});
