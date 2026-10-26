# Architecture Domain: Organization

> **Source**: `repo-harness run capability-resolver`
> **Owner**: Provider issue fleet boards, the admitted Task Inbox, provider PR readiness and manual provider feedback.

## Purpose

The organization domain observes delivery across registered repositories.
Task fleet joins provider issue observations to exact admitted sessions. It
stores admitted task messages in the Task Inbox. Publication observes provider
PR readiness and integration evidence. It records manual feedback against an
admitted claim and provider PR evidence. Neither capability adds a new
authority class. GitHub issues and pull requests own task identity, claim and
status. Review admission owns execution approval. The provider and the user
perform the merge.

## Capabilities

- `organization-task-fleet` -> `docs/architecture/modules/organization/task-fleet.md`: joins registered repositories to provider issue observations and exact admitted sessions, stores admitted task messages and projects the read-only fleet board.
- `organization-publication` -> `docs/architecture/modules/organization/publication.md`: derives provider PR readiness from explicit canonical identity at read time, provides merge commit evidence for integration and records manual provider feedback.

## Stable Rules

- A fleet card joins a provider issue to zero or more exact admitted sessions. A local task label never establishes provider identity.
- A task message is a communication fact only. Send, delivery and acknowledgement never change a provider claim. Message bodies are untrusted peer data.
- The fleet board is a separate read-only model. It persists no column and no `ready` flag.
- Merge readiness is derived at read time. The system never persists `ready=true`.
- Historical records stay explicit history. They never become current readiness or dependency authority.
- Publication never merges a pull request.

## Verification Surface

Each capability node lists its verification commands in `extensions.verification`:
`.archcontext/model/nodes/capability.organization.task-fleet.yaml` and
`.archcontext/model/nodes/capability.organization.publication.yaml`.
