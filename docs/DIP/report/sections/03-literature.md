# 3. Literature Review

The detailed review examines **13 sources** across agricultural adoption, Kazakhstan’s context, sensors and digital twins, local-first systems, authentication and weather. It combines recent publications with foundational synchronisation research, an FAO report and the weather provider’s software reference. The evidence informs design choices; it does not establish EGIN’s effectiveness with users.

| Research theme and sources | Main finding | Implication and limitation for EGIN |
|---|---|---|
| Adoption and Kazakhstan [1–3] | Connectivity, cost and skills constrain uptake. | Prioritise offline access and simple onboarding; sector findings require local validation. |
| IoT and digital twins [4–7] | Useful models require reliable measurements and integration. | Keep sensor registration separate from telemetry; the crop illustration is not a validated twin. |
| Local-first and CRDTs [8–9] | Local copies support availability; convergence and merge design require trade-offs. | Use IndexedDB, versions, tombstones and explicit conflict choices; validate recovery behaviour. |
| Passkeys [10–11] | Recovery, cross-device friction and key lifecycle failures matter. | Rotate recovery codes and protect the last passkey; security mechanisms still need usability evaluation. |
| Rural PWA assistance [12] | Lightweight web delivery can suit constrained environments. | Supports PWA exploration; an advisory chatbot is not direct evidence for cadastral workflows. |
| Open-Meteo [13] | Shared forecast models supply coordinate-based weather. | Show source and freshness; forecast output is not an on-site measurement. |

Three conclusions shape the implementation. First, the offline-first approach responds to documented access barriers, while its value must be measured on actual farm tasks. Second, explicit data provenance prevents an attractive visualisation from implying unavailable agricultural analytics. Third, authentication and synchronisation require failure-oriented verification as well as successful demonstrations.

The review’s principal limitation is transferability: general agricultural surveys, security studies and distributed-systems theory do not replace participant observations, physical-device checks or a controlled evaluation of this particular application.
