# 2. Evidence of the Relevance

## 2.1 Stakeholder engagement and relevance to EGIN

During the initial exploration of EGIN, the project team held informal discussions with approximately **10–15 potential users: farmers and agronomists in Kazakhstan**. According to the team's account, the participants included owners or managers of substantial agricultural land holdings, with areas described in hectares. The discussions concerned the project idea, its potential usefulness and problems in the agricultural sector. Exact farm sizes, participant-level responses, meeting dates and interview transcripts have not yet been included in the evidence package.

The team also **met with Zhiguli Dairabayev, identified by the team as a representative of the Auyl party**, and reports that he expressed support for promoting the project. His [official parliamentary profile](https://www.parlam.kz/kk/blogs/dayrabaev) provides background on his agricultural policy involvement [19]. **This link identifies the stakeholder; it is not a published record of the team's meeting.** A dated meeting note, photograph with context, correspondence or an event publication is still needed to document that particular encounter.

These activities establish contact with people connected to the intended application domain and provide a reasonable basis for further requirements discovery. EGIN's implemented plot management, cadastral lookup, coordinate-based weather, local data storage, event centre and report export provide concrete scenarios to discuss with those stakeholders. The project therefore has an inspectable prototype around which subsequent validation can be organised, rather than only an abstract product proposal.

However, general interest in the idea does not establish that any particular feature is required, that users will adopt the product, or that the system improves farm outcomes. No participant quotations, feature rankings, willingness-to-pay figures or measured productivity gains are claimed here. **Support for project promotion does not constitute an official partnership, a procurement commitment, a signed client agreement or acceptance of the delivered software.**

The current evidence is exploratory. The proposal primarily targets small farms, whereas some reported discussions involved managers of larger holdings. Follow-up validation should therefore distinguish farm size, role, device access and existing work practices, rather than treating these groups as interchangeable.

## 2.2 Evidence register and strength of claims

The evidence review concerns repository snapshot `8cc0ca3f73052b030dcddb990b8a5460be9ddcdf`, reviewed on **23 October 2026**, together with the project owner's account supplied during documentation preparation. That date is the review date, not the date of the interviews or stakeholder meeting.

| ID | Evidence | What it supports | Current status and limitation |
|---|---|---|---|
| E2-01 | The team's account of discussions with approximately 10–15 potential users: farmers and agronomists in Kazakhstan | Initial contact with potential users and discussion of the agricultural problem domain | **Team-reported.** Individual records, dates, consent and attributable findings are not yet attached; this is not a verified count of structured interviews. |
| E2-02 | The team's account of its meeting with Zhiguli Dairabayev and his support for promotion | Stakeholder engagement and interest in communicating the project | **Team-reported.** The official profile [19] supplies background only. Meeting-specific documentation and the precise scope of support remain to be attached. No formal agreement is asserted. |
| E2-03 | The literature and regional context reviewed in [Part 3](PART-3-LITERATURE-REVIEW.md), with sources in [References](REFERENCES.md) | A secondary-source rationale for investigating rural connectivity, usability and fragmented agricultural information | **Documented literature rationale.** Sector-level findings are not observations from these particular participants, nor proof of EGIN's effectiveness. |
| E2-04 | The application source, test scenarios and prototype inventory in [Part 8](PART-8-UX-PROTOTYPE.md) and [Part 9](PART-9-VERIFICATION-EVALUATION.md) | The existence of software mechanisms that can be evaluated against the proposed needs | **Inspectable implementation evidence.** Code and screenshots establish capability or presentation, not user demand or successful field adoption. |
| E2-05 | Owner-defined project constraints in [AGENTS.md](../../AGENTS.md) and the scope in [Part 1](PART-1-PROPOSAL.md) | Phone-first design, the prominent crop view, clear eGov limitations, environment isolation, controlled deployment and developer-portal boundaries | **Recorded project direction.** These constraints come from the project owner and design scope; they are not quotations from farmers or a signed external client contract. |

Only E2-01 and E2-02 concern direct engagement reported by the team. E2-03 provides secondary context, E2-04 provides technical evidence and E2-05 records product decisions. These categories must remain separate when presenting requirements to the committee.

## 2.3 Requirements hypotheses to validate

The following hypotheses connect the project to testable user needs. They are **proposed interpretations**, not reconstructed interview results. Requirement identifiers refer to [Part 6](PART-6-REQUIREMENTS.md).

| ID | Hypothesis | Relevant implementation and requirement | Evidence needed to accept or revise it |
|---|---|---|---|
| H1 | Access to saved plot information and reliable local changes are useful when a field worker temporarily loses connectivity. | Local field and sensor data in IndexedDB, synchronisation queue and explicit conflicts; FR-FLD-6, FR-SYNC-1–8, NFR-REL-1. Manual diary entry is not an active user flow in the current event-centre UI. | Observe a real task under the participant's normal connectivity conditions; record which information must remain available, and test recovery after reconnection. |
| H2 | Finding a plot by an existing cadastral identifier can reduce the effort of establishing its boundary compared with a user's current manual process. | EGKN search, preview and confirmation, with GeoJSON/geolocation fallbacks; FR-FLD-1–4, NFR-USE-4. | A paired task with the same plot and verified identifier; record completion time, boundary correctness, failures and participant comments. |
| H3 | Passwordless access with an explicit recovery path can be understandable and usable for the intended users. | WebAuthn registration, recovery and cross-device QR; FR-AUTH-1–4. | A first-use and recovery walkthrough on real participant devices; record assistance, errors and successful completion. Security tests alone do not establish usability. |
| H4 | A read-only connection to an existing 1C system may reduce duplicate entry for farms that actually use compatible OData publication. | The 1C connector and owner-scoped import; FR-INT-1–2. | Confirm which participants use 1C, obtain an authorised test instance and compare a defined import task with their current process. No client deployment is claimed. |
| H5 | Presenting a forecast for the selected plot can make locating relevant weather information easier than switching between separate tools. | Plot-coordinate weather and freshness indicators; FR-WTH-1–3. | Compare retrieval tasks using the same location, forecast source and observation time; assess location selection and freshness comprehension, not forecast accuracy or crop yield. |

The prominent 3D crop view is an owner-defined design choice (E2-05). It should be evaluated for comprehension and usability; it is not presented as a farmer-validated requirement or a measurement-driven digital twin. Likewise, the existence of chat, marketplace and trade modules does not demonstrate demand for those extensions: their stakeholder value requires separate evidence.

## 2.4 Interview record structure

For the assessment, prepare **3–5 traceable discussion records** selected from the reported engagement, or collect follow-up records where earlier notes cannot be recovered. Do not convert the estimated 10–15 participants into completed structured interviews retrospectively. The slots below are a collection template, not five already documented participants.

| Participant | Role | Agricultural Context | Discussed Problem | Feedback | Requirement Implication |
|---|---|---|---|---|---|
| P01 — record pending | To be recorded | Farm scale, region, crops and current tools: to be recorded | To be taken from a dated discussion note | Verified paraphrase or consented quotation pending | Link a specific observation to an FR/NFR or hypothesis after review |
| P02 — record pending | To be recorded | To be recorded; do not infer from another participant | Source record pending | Source record pending | Pending evidence review |
| P03 — record pending | To be recorded | To be recorded; do not infer from another participant | Source record pending | Source record pending | Pending evidence review |
| P04 — optional additional record | To be recorded | To be recorded | Source record pending | Source record pending | Pending evidence review |
| P05 — optional additional record | To be recorded | To be recorded | Source record pending | Source record pending | Pending evidence review |

Each completed record should additionally contain its date, discussion format, interviewer, participant permission, supporting-file identifier and the distinction between a direct quotation and a team interpretation. Use pseudonyms in the report where appropriate. Keep identifiable source material in an agreed restricted location and attach only material approved for the defence.

Suggested follow-up questions are: What plot-related task was last performed? Which tools were used? Where was information copied or searched for twice? What happened when connectivity was lost? Which proposed EGIN task would be useful, unnecessary or confusing? What would prevent adoption? Ask these questions before presenting a preferred feature, and record negative as well as positive feedback.

## 2.5 Supporting materials to attach

| Material | Purpose | Current availability |
|---|---|---|
| Dated notes for at least three substantive user discussions, ideally five | Establish who was consulted, what was discussed and how a requirement follows from the discussion | Not supplied in the current repository evidence package |
| An anonymised participant/context register | Distinguish farmers, agronomists and managers, and separate small-farm needs from larger-operation needs | Template provided in Section 2.4; individual records pending |
| A contextualised photograph, correspondence or dated note of the Dairabayev meeting | Document that the reported meeting took place | Meeting reported by the team; meeting-specific attachment pending |
| Recording excerpts or a participant-approved summary, where available and permitted | Support the substance of a discussion rather than merely the presence of attendees | Not supplied; do not invent transcripts or quotations |
| A requirement decision log linking evidence IDs to FR/NFR IDs | Show which decisions changed because of stakeholder input and which remain design hypotheses | Initial mapping in Sections 2.2–2.3; participant-level validation pending |
| An actual client letter or agreement, only if one is later obtained | Establish a defined client relationship and its agreed scope | No signed client agreement is claimed or required as a substitute for the reported meeting |

A photograph can support attendance but cannot by itself establish agreement on requirements. A public biography supports identity but cannot establish that a private meeting occurred. Attach these materials with accurate captions and the appropriate claim scope.

## 2.6 Implications for the next evaluation stage

The available account supports continued investigation of EGIN with agricultural users, while the implementation provides tasks that can be demonstrated and measured. The next step is to make the existing engagement traceable, select representative tasks and execute the protocol in [Part 9](PART-9-VERIFICATION-EVALUATION.md). Requirements should then be retained, revised or rejected on the basis of recorded observations.

Criterion 2 should therefore be presented as **stakeholder engagement reported; supporting records and feature-level validation pending**. The report does not claim that promotional support or an estimated participant count alone satisfies the evidence standard.
