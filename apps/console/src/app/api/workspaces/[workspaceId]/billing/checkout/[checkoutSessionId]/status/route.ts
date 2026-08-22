import { NextResponse } from "next/server";
import { verifyCheckoutStatus } from "../../../../../../../../lib/billing-data";

export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ workspaceId: string; checkoutSessionId: string }> },
) {
  const { workspaceId, checkoutSessionId } = await params;

  const result = await verifyCheckoutStatus({
    organizationId: "org_northstar",
    workspaceId,
    checkoutSessionId,
  });

  return NextResponse.json(result);
}
