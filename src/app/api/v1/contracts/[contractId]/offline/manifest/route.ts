import { requireApiContractAccess } from "@/lib/api-auth";
import { apiError, success } from "@/lib/api-response";
import { getOfflineManifest, OfflineManifestError, parseOfflineManifestRequest } from "@/lib/offline-manifest";

export const runtime = "nodejs";
export async function GET(request:Request,{params}:{params:Promise<{contractId:string}>}) {
  const {contractId}=await params;const access=await requireApiContractAccess(request,contractId);
  if(!access.ok){access.response.headers.set("Cache-Control","no-store");return access.response;}
  const headers={"Cache-Control":"no-store"};
  try{
    const query=parseOfflineManifestRequest(new URL(request.url).searchParams);
    const data=await getOfflineManifest({appId:access.context.app.id,userId:access.context.user.id,contractId:access.context.contract.id},query);
    return success(data,{headers});
  }catch(error){
    if(error instanceof OfflineManifestError)return apiError({code:error.code,status:error.status,message:error.message,headers});
    // Missing migration or unavailable database is never an unchanged/empty manifest.
    return apiError({code:"OFFLINE_MANIFEST_UNAVAILABLE",status:503,message:"El diagnóstico de revisiones no está disponible. No se autoriza reutilizar datos.",headers});
  }
}
