import { NextResponse } from "next/server";
import { createCheckoutSession } from "../../../../../../lib/billing-data";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const body = await request.json().catch(() => ({}));

  const session = await createCheckoutSession({
    organizationId: "org_northstar",
    workspaceId,
    packageId: body.packageId,
    customAmount: body.amount,
    currency: body.currency ?? "USD",
  });

  return NextResponse.json(session, { status: 201 });
}
