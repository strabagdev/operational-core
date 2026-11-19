import {describe,it,expect} from "vitest";
import {parseCaptureTime,assertCaptureFieldRole,validCaptureInstant,validCaptureZone} from "./capture-time";
describe("capture configuration is optional and cannot manufacture historical instants",()=>{
 it("validates the IANA zone and strict optional binding",()=>{expect(parseCaptureTime(undefined)).toBeUndefined();expect(parseCaptureTime({fieldId:"f",timeZone:"America/Santiago"})).toEqual({fieldId:"f",timeZone:"America/Santiago"});for(const v of[null,{}, {fieldId:"f",timeZone:"-03:00"},{fieldId:"f",timeZone:"bad/zone"},{fieldId:"f",timeZone:"UTC",extra:true}])expect(()=>parseCaptureTime(v)).toThrow();expect(validCaptureZone("UTC")).toBe(true);});
 it("requires a simple optional DATETIME without defaults or uniqueness",()=>{const f={type:"DATETIME",multiple:false};expect(()=>assertCaptureFieldRole(f)).not.toThrow();for(const x of[{type:"DATE"},{multiple:true},{required:true},{isUnique:true},{config:{validation:{required:true}}},{config:{defaultValue:"now"}}])expect(()=>assertCaptureFieldRole({...f,...x})).toThrow();});
 it("does not accept local time, a date or a normalised invalid date as capture",()=>{for(const v of[null,"2026-11-17","2026-11-17T10:00:00","2026-02-30T01:00:00.000Z"])expect(validCaptureInstant(v)).toBe(false);expect(validCaptureInstant("2026-11-18T02:30:45.123Z")).toBe(true);});
});
