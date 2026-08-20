import { AdminShell, AdminTable } from "../../../components/admin-shell";

export default function Page() {
  const action = <button className="primary" type="button">Create workspace</button>;
  return <AdminShell title="Workspaces" description="Manage tenant environments, access and usage boundaries." action={action}><AdminTable subject="Workspaces" emptyDetail="Create a workspace to establish an isolated operating boundary." action={<button type="button">Create workspace</button>} /></AdminShell>;
}
