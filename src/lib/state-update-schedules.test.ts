import {describe,expect,it} from "vitest";
import {nominalScheduleMinutes,parseScheduleReference,scheduleConsumer,scheduleRevisionInput,scheduleRevisionFromForm} from "./state-update-schedules";
describe("civil schedule contract",()=>{
 it("keeps nominal clock duration independent of UTC instants and calendar boundaries",()=>{
  expect(nominalScheduleMinutes("08:00","20:00",0)).toBe(720);
  expect(nominalScheduleMinutes("20:00","08:00",1)).toBe(720);
  expect(nominalScheduleMinutes("00:00","00:00",1)).toBe(1440);
  expect(()=>nominalScheduleMinutes("20:00","08:00",0)).toThrow();
  expect(()=>nominalScheduleMinutes("20:00","08:00",2)).toThrow();
 });
 it("rejects incomplete references, invalid DATEs and unknown optional policies",()=>{
  expect(scheduleConsumer(null)).toBeUndefined();
  expect(()=>scheduleConsumer({kind:"unknown"})).toThrow();
  expect(()=>parseScheduleReference({schemaVersion:1,bindingId:"b",revisionId:"r"})).toThrow();
  expect(parseScheduleReference({kind:"legacy"})).toEqual({kind:"legacy"});
  const form=new FormData();for(const [key,value]of Object.entries({name:"Night",startTime:"20:00",endTime:"08:00",effectiveFrom:"2030-01-06",endDayOffset:"1"}))form.set(key,value);
  expect(scheduleRevisionFromForm(form)).toMatchObject({endDayOffset:1,effectiveFrom:"2030-01-06"});form.delete("endDayOffset");expect(()=>scheduleRevisionFromForm(form)).toThrow();

  expect(()=>scheduleRevisionInput.parse({name:"Test",startTime:"08:00",endTime:"20:00",endDayOffset:0,effectiveFrom:"2030-02-30"})).toThrow();
 });
});

it("civil nominal duration stays 12h while real Santiago DST nights last 11h or 13h (test-only instant comparison)",()=>{
 const zone="America/Santiago", dayMs=86400000;
 const offset=new Intl.DateTimeFormat("en",{timeZone:zone,timeZoneName:"longOffset"});
 const civil=new Intl.DateTimeFormat("en",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"});
 const text=(instant:Date)=>{const p=civil.formatToParts(instant);return ["year","month","day","hour"].map(type=>p.find(v=>v.type===type)!.value).join("-");};
 const observed:number[]=[];
 for(let i=1;i<365;i++){
  const noon=new Date(Date.UTC(2025,0,1,12)+i*dayMs),previous=new Date(noon.getTime()-dayMs);
  const getOffset=(d:Date)=>offset.formatToParts(d).find(p=>p.type==="timeZoneName")!.value;
  if(getOffset(noon)===getOffset(previous))continue;
  const startDate=previous.toISOString().slice(0,10),endDate=noon.toISOString().slice(0,10),instants=new Map<string,number>();
  for(let hour=-24;hour<=48;hour++){const candidate=new Date(Date.parse(startDate+"T00:00:00Z")+hour*3600000);instants.set(text(candidate),candidate.getTime());}
  const start=instants.get(startDate+"-20"),end=instants.get(endDate+"-08");expect(start).toBeDefined();expect(end).toBeDefined();
  observed.push((end!-start!)/60000);expect(nominalScheduleMinutes("20:00","08:00",1)).toBe(720);
 }
 expect(observed.sort((a,b)=>a-b)).toEqual([660,780]);
});
