> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# npm Release 0.1.2 Publish Notes

Date: 2026-05-30

## Decision

Publish `repo-harness@0.1.2` as the npm/CLI release while keeping generated
workflow compatibility documented as `5.2.3`.

## Rationale

- `package.json` already carries the unpublished npm package version `0.1.2`;
  the public registry still reports `repo-harness@0.1.1` as latest.
- README needed to make the split explicit so users do not confuse npm package
  semver with the generated harness model line.
- The release gate must check `https://registry.npmjs.org/` directly rather
  than the local npm mirror configured on the maintainer machine, because mirror
  lag could incorrectly allow a duplicate publish attempt.

## Boundary

This slice updates release documentation and the npm publish gate only. It does
not change generated harness behavior or bump the workflow compatibility line.
