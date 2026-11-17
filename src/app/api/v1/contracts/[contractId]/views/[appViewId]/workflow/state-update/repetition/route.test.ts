import { beforeEach,describe,expect,it,vi } from "vitest";
import { POST as sharedPost } from "../route";
import { POST } from "./route";
vi.mock("../route",()=>({POST:vi.fn()}));
const context={params:Promise.resolve({contractId:"contract",appViewId:"view"})};
beforeEach(()=>{vi.mocked(sharedPost).mockReset();});
describe("fail-closed repetition route",()=>{
  it.each(["MULTIPLE","MULTIPLE_WITH_WARNING"])("delegates %s unchanged to the authenticated shared handler",async repetitionPolicy=>{
    const body={repetitionPolicy,clientRequestId:"stable",targetRecordId:"selected",overwrite:true};
    const request=new Request("http://localhost/api/v1/contracts/contract/views/view/workflow/state-update/repetition",{method:"POST",body:JSON.stringify(body)});
    vi.mocked(sharedPost).mockImplementation(async req=>{expect(await req.json()).toEqual(body);return new Response(null,{status:403});});
    expect((await POST(request,context)).status).toBe(403);expect(sharedPost).toHaveBeenCalledWith(request,context);
  });
  it.each([{}, {repetitionPolicy:"ONE_PER_DAY"},{repetitionPolicy:"FUTURE"}])("cannot downgrade the dedicated command to default semantics: %o",async body=>{
    const response=await POST(new Request("http://localhost/command",{method:"POST",body:JSON.stringify(body)}),context);
    expect(response.status).toBe(400);expect((await response.json()).error.code).toBe("ATTENDANCE_REPETITION_COMMAND_REQUIRED");expect(sharedPost).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON without dispatching a mutation",async()=>{expect((await POST(new Request("http://localhost/command",{method:"POST",body:"{"}),context)).status).toBe(400);expect(sharedPost).not.toHaveBeenCalled();});
});
