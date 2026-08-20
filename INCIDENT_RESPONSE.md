# Incident Response

Lifecycle: detect, declare, assign Incident Commander, contain, mitigate, recover, communicate, resolve and review. Roles are Incident Commander, Operations Lead, Security Lead, Communications Lead and subject-matter engineers.

Severity semantics: SEV0 catastrophic/existential, SEV1 critical production impact, SEV2 significant degradation, SEV3 limited impact, SEV4 informational follow-up. Pages require timely action; non-actionable signals remain tickets.

Security containment includes revoking API/service/provider credentials, terminating user and privileged sessions, restricting an organization, disabling integrations/providers/models, blocking traffic and reverting compromised deployments. Preserve authentication, audit, deployment and request metadata for forensics. Public updates use Investigating, Identified, Monitoring and Resolved without sensitive details.

Every significant incident produces a timeline, impact, root/contributing causes, detection/response gaps and corrective actions with owners/deadlines.
