# Backup and Restore

PostgreSQL financial, tenant and configuration data is the critical backup domain. Object exports are reproducible and lifecycle-managed; retained customer content follows policy. Infrastructure configuration remains version-controlled.

Required production configuration: encrypted automated backups, separate failure domain, least-privilege restore access, retention monitoring and immutable/audited deletion controls. RPO/RTO remain pending measured infrastructure capability and commercial approval.

Restore test procedure:

1. Select a backup and record identifier, timestamp and checksum.
2. Restore into an isolated environment with no customer egress.
3. Apply compatible schema migrations using the migration role.
4. validate tenant counts, scoped sample records, ledger balancing, wallet derivation, pricing versions and audit continuity.
5. Start services using isolated credentials and execute read-only smoke tests.
6. Record elapsed time, observed data loss, failures and corrective actions in `reports/backup-restore-report.md`.

A backup is not certified until this procedure has been executed successfully. Current status: not executed.
