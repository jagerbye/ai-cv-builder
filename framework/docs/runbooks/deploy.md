# runbook: deploy & rollback

> **What this file is:** how a change reaches each environment and how to
> undo it. Exists because "enterprise" means the rollback path is written
> BEFORE the first deploy, not during the first incident.
> **Who reads it:** Orchestrator/Integrator at sprint end; humans on release.

## Environments

| Env | URL/host | Deployed by | From branch |
|---|---|---|---|
| staging | … | … | … |
| production | … | … | … |

## Deploy procedure

<!-- Numbered steps incl. the verification step after deploy ("smoke:
     open X, expect Y"). A deploy without a post-check is not done. -->

## Rollback procedure

<!-- Exact steps to return to the previous version, incl. what to do about
     applied migrations. Test this path before you need it. -->

## Release checklist

- [ ] CI green on the release commit
- [ ] migrations reviewed for rollback-ability
- [ ] post-deploy smoke passed
- [ ] sprint report updated with the released version
