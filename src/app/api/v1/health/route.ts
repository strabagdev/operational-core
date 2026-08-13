import { success } from "@/lib/api-response";

export async function GET() {
  return success({
    service: "opco-api",
    version: "v1",
  });
}
