import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; invoiceId: string }> },
) {
  const { invoiceId } = await params;

  const samplePdfContent = `%PDF-1.4
% GrowX AI Gateway Official Tax Invoice
Invoice ID: ${invoiceId}
Status: PAID
Issue Date: ${new Date().toISOString()}
Total: $200.00 USD
Tax Total: $0.00 USD
Settlement Engine: Phase-16/Phase-20 Canonical Engine
%%EOF`;

  return new NextResponse(samplePdfContent, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoiceId}.pdf"`,
    },
  });
}
