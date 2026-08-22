import { AdminShell } from "../../../components/admin-shell";
import { listAdminModels } from "../../../lib/admin-data";
import { AdminModelsView } from "../../../components/admin-models-view";

export default async function AdminModelsPage() {
  const models = await listAdminModels();

  return (
    <AdminShell
      title="Model Registry Administration"
      description="Operator model catalog, capability profiles, upstream provider bindings, and emergency kill switches."
    >
      <AdminModelsView initialModels={models} />
    </AdminShell>
  );
}
