# 6. Requirements Specification

Requirements retain stable `FR` and `NFR` identifiers and MoSCoW priorities. The complete register contains **39 Must requirements: 21 functional and 18 non-functional**. This is a priority count, not a pass count. Implementation status comes from source inspection; acceptance additionally requires the specified automated test, demonstration, inspection or measurement.

The grouped register below summarises key acceptance obligations; the [full specification](../../PART-6-REQUIREMENTS.md) retains individual priorities, criteria and traceability to literature, stakeholder hypotheses and recorded owner constraints.

| Requirement group and IDs | Acceptance criteria | Current evidence/status |
|---|---|---|
| Identity: FR-AUTH-1–5 | Reject invalid passkey assertions; rotate recovery codes; prevent last-key deletion; distinguish EGIN QR from unavailable eGov. | Web implementation present; native iOS passkey configuration pending. Full authentication acceptance remains open. |
| Plots: FR-FLD-1,3,4,6 | Preview before saving; exclude personal cadastral data; preserve GeoJSON geometry; retain boundaries offline. | Implemented. Geometry/privacy fixtures passed; complete browser/device demonstration remains pending. |
| Offline data: FR-SYNC-1–8; FR-REC-1 | Preserve queued changes; resolve conflicts explicitly; avoid duplicates and resurrected deletions; isolate profiles. | Synchronisation mechanics implemented; manual diary creation is partial because no composer is exposed. |
| Weather, events and exports: FR-WTH-1–3; FR-EVT-1; FR-RPT-1 | Bind forecasts to plot coordinates, filter events correctly and export safe HTML/CSV/JSON. | Implemented; relevant unit checks passed. Live-provider and export-download acceptance remain separate. |
| Honest presentation: FR-HOME-3; FR-SNS-2 | Label the crop scene as illustrative; never imply telemetry from sensor registration. | Implemented; fixture screens show these boundaries. |
| Integrations: FR-INT-1–2; FR-API-1–3 | Keep 1C import read-only/idempotent; enforce scoped keys and route-catalog consistency. | Implemented artefacts; full integration suites remain blocked or pending. |
| Quality: NFR-USE-1–3; NFR-PERF-1; NFR-REL-1–3 | No phone overflow; readable contrast; LCP ≤4 s; no silent data loss; rollback ≤60 s. | Comprehensive accessibility, performance, recovery and device measurements planned. |
| Security and delivery: NFR-SEC-2,3,6; NFR-CMP-1; NFR-MNT-1,3 | Enforce ownership, protect secrets, separate environments, protect merges and gate native builds. | Safeguards inspected; branch protection was absent at historical review; native acceptance remains open. |

Out-of-scope requirements include sensor telemetry and contractual government/partner integrations. A completed web implementation does not close partial Must requirements. Outstanding criteria need recorded results or an explicitly agreed scope revision; Section 9 distinguishes executed checks from planned acceptance.
