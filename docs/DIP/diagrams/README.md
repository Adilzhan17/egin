# Editable report diagrams

Architecture diagrams `01`–`06` use PlantUML (`.puml`). The prototype navigation diagram `07` uses Mermaid (`.mmd`) and reproduces the navigation relationships in Part 8, Section 8.2.

Every source has an SVG and PNG export in [`export/`](export/). Use the PlantUML SVG files for vector-quality architecture figures. The hosted Mermaid renderer includes HTML `foreignObject` labels in its SVG output; use the corresponding PNG when a document renderer does not support those labels.

To regenerate PlantUML exports locally from the repository root:

```bash
java -jar plantuml.jar -tsvg -o export docs/DIP/diagrams/*.puml
java -jar plantuml.jar -tpng -o export docs/DIP/diagrams/*.puml
```

Public diagram sources can also be sent as UTF-8 plain-text POST requests to `https://kroki.io/plantuml/svg`, `https://kroki.io/plantuml/png`, `https://kroki.io/mermaid/svg` or `https://kroki.io/mermaid/png`, selecting the endpoint that matches the source format. The response body is the corresponding export. Regenerate both formats after changing a source.

These diagrams describe architecture and navigation. They do not establish completion of native-device testing, a released Android/iOS package or end-to-end acceptance of every depicted scenario. Parts 6, 8 and 9 record the implementation and verification boundaries.
