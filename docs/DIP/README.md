# EGIN — Diploma Project Documentation

This directory contains the report sections and supporting evidence for the EGIN project. The submission follows the existing source order: Parts 1–10, followed by References as section 11. Report text and tables are in English; the implemented application currently displays its original Russian interface.

## Probation Period 1 submission

- **Group:** SE-2414.
- **Team:** Adilzhan Amangeldi and Rustam Seitzhan.
- **Submission representative / filename:** Adilzhan Amangeldi; `SE-2414_Amangeldi_ProbPeriod1.pdf`.
- **Report:** [Download the concise 15-page PDF](report/SE-2414_Amangeldi_ProbPeriod1.pdf). The detailed section files remain available below.
- **Repository version:** [`prob-period-1`](https://github.com/Adilzhan17/egin/tree/prob-period-1).

The `prob-period-1` submission packages the report sources, editable diagram files and supporting evidence. It retains the historical implementation review at `8cc0ca3`. Both web applications were subsequently rebuilt from `b0b0f46`, whose application-source tree is identical, and the nine UI screenshots were recaptured from those builds. These additional build/rendering checks do not replace the historical API/CI results or establish final acceptance of every requirement.

The current PDF on `main` is a concise editorial revision describing the same frozen project version. Its [editable summary sections and build instructions](report/README.md) link to the detailed tagged evidence. The existing tag remains fixed and contains the earlier long report; use the current PDF link above for the 15-page edition.

## Report sections

| Part | Document |
|---|---|
| 1 | [Project Proposal](PART-1-PROPOSAL.md) |
| 2 | [Evidence of the Relevance](PART-2-EVIDENCE-OF-RELEVANCE.md) |
| 3 | [Literature Review](PART-3-LITERATURE-REVIEW.md) |
| 4 | [Existing System Comparison](PART-4-SYSTEM-COMPARISON.md) |
| 5 | [Technology Comparison](PART-5-TECHNOLOGY-COMPARISON.md) |
| 6 | [Requirements Specification](PART-6-REQUIREMENTS.md) |
| 7 | [Architecture and Diagrams](PART-7-ARCHITECTURE.md) |
| 8 | [UX / Prototype](PART-8-UX-PROTOTYPE.md) |
| 9 | [Verification and Evaluation Plan](PART-9-VERIFICATION-EVALUATION.md) |
| 10 | [Project Management and Risks](PART-10-PROJECT-MANAGEMENT-RISKS.md) |
| 11 | [References](REFERENCES.md) |

## Evidence boundaries

Parts 2, 8, 9 and 10 were prepared from source baseline [`8cc0ca3`](https://github.com/Adilzhan17/egin/commit/8cc0ca3f73052b030dcddb990b8a5460be9ddcdf) and the project owner's account on **23 October 2026**. This remains the implementation review baseline. The `prob-period-1` tag identifies the later report-submission package; it does not change the reviewed revision or establish final acceptance.

- Stakeholder discussions and the meeting with Zhiguli Dairabayev are reported by the team; participant-level records and meeting-specific attachments remain to be collected.
- Part 8 distinguishes inspected source functionality from screenshots of fresh, commit-identified web builds using synthetic fixtures. Build commands and artifact fingerprints are recorded in the capture evidence.
- Part 9 separates executed checks, historical reports, environment failures, skipped tests and proposed outcome measurements.
- Part 10 uses documented team roles and actual Git evidence. YouTrack is not presented as an existing project; GitHub and the report's work register are the current management basis.
- The current website contains chat, marketplace and trade/business extensions beyond the original land-management focus. Their presence does not automatically expand the agreed diploma acceptance scope.

Use the evidence qualifications when presenting the report. A mock response is not a live integration result, an implementation is not a completed user study, and configured Capacitor support is not proof of a released native application.
