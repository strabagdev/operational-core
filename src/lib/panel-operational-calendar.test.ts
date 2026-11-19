import{beforeEach,describe,it,expect,vi}from"vitest";
import{resolvePanelOperationalFilters,PanelOperationalCalendarError}from"./panel-operational-calendar";
import{resolveApiOperationalCalendars,type SerializedApiAppView}from"./api-app-views";
import{panelFixtureConfig}from"../test/panel-local-fixture";
import{OperationalCalendarEditor}from"../app/app/contracts/[contractId]/settings/views/operational-calendar-editor";
import{createElement}from"react";
import{renderToStaticMarkup}from"react-dom/server";
import type{PanelFilter}from"./app-views";
const{read}=vi.hoisted(()=>({read:vi.fn()}));vi.mock("./prisma",()=>({prisma:{appView:{findFirst:read}}}));
const calendar={version:1 as const,timeZone:"America/Santiago",dayStart:"08:00",bands:[{optionId:"actual-a",start:"08:00",end:"20:00"}]};
const filter:PanelFilter={id:"day",valueType:"DATE",required:true,defaultValue:{type:"OPERATIONAL_TODAY",calendarAppViewId:"owner"}};
beforeEach(()=>{read.mockReset();read.mockResolvedValue({config:{workflowKey:"attendance",operationalCalendar:calendar}});});
describe("linked operational calendar and editor",()=>{
 it("resolves metadata only from the active owner in the same contract",async()=>{const result=await resolvePanelOperationalFilters([filter],"contract");expect(read).toHaveBeenCalledWith(expect.objectContaining({where:{id:"owner",contractId:"contract",active:true,type:"WORKFLOW"},select:{config:true}}));expect(result[0].defaultValue).toMatchObject({calendar});expect(filter.defaultValue).not.toHaveProperty("calendar");});
 it("fails a missing/malformed owner without inventing a zone or dropping other views",async()=>{
 for(const owner of[null,{config:{workflowKey:"attendance",operationalCalendar:{...calendar,timeZone:"Mars/Olympus"}}}]){
 read.mockResolvedValue(owner);await expect(resolvePanelOperationalFilters([filter],"contract")).rejects.toBeInstanceOf(PanelOperationalCalendarError);
 const legacy={id:"legacy",type:"RECORDS",icon:null,name:"Legacy",slug:"legacy",sortOrder:0,config:{entityTypeId:"e"}}as SerializedApiAppView;
 const panel={id:"panel",type:"PANEL",config:{...panelFixtureConfig(),filters:[filter]}}as unknown as SerializedApiAppView;
 const result=await resolveApiOperationalCalendars([legacy,panel],"contract");expect(result[0]).toBe(legacy);expect(result[1]).toBe(panel);
 }
 });
 it("keeps legacy defaults byte-identical without extra reads",async()=>{const legacy:PanelFilter[]=[{id:"date",valueType:"DATE",defaultValue:{type:"TODAY",timeZone:"UTC"}}];expect(await resolvePanelOperationalFilters(legacy,"contract")).toBe(legacy);expect(read).not.toHaveBeenCalled();});
 it("changes PANEL revision when the shared owner changes",async()=>{const panel={id:"p",type:"PANEL",config:{...panelFixtureConfig(),filters:[filter]}}as unknown as SerializedApiAppView;const[a]=await resolveApiOperationalCalendars([panel],"c");read.mockResolvedValue({config:{workflowKey:"attendance",operationalCalendar:{...calendar,dayStart:"09:00"}}});const[b]=await resolveApiOperationalCalendars([panel],"c");expect(a.configRevision).not.toBe(b.configRevision);});
 it("renders the optional editor with real option IDs and explicit FormData JSON",()=>{
 const markup=renderToStaticMarkup(createElement(OperationalCalendarEditor,{initial:calendar,options:[{id:"actual-a",label:"Visible label",isActive:true}]}));expect(markup).toContain('name="operationalCalendar"');expect(markup).toContain('value="actual-a"');expect(markup).toContain('value="08:00"');expect(markup).toContain('America/Santiago');expect(markup).toContain('checked=""');
 const off=renderToStaticMarkup(createElement(OperationalCalendarEditor,{options:[]}));expect(off).toContain('name="operationalCalendar" value=""');expect(off).not.toContain('checked=""');
 });
});
