import { redirect } from "next/navigation";

export default async function NewApiKeyPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; workspaceSlug: string }>;
}) {
  const { organizationSlug, workspaceSlug } = await params;
  redirect(`/${organizationSlug}/${workspaceSlug}/api-keys`);
}
