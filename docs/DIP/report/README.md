# Concise Probation Period 1 report

The current submission is [SE-2414_Amangeldi_ProbPeriod1.pdf](SE-2414_Amangeldi_ProbPeriod1.pdf), a concise report capped at **20 pages**. It retains all eleven sections, a linked contents page, three summary architecture diagrams, two prototype screenshots, verification results, limitations and next steps. Detailed originals remain in the parent directory and are linked from the PDF.

The report describes the application version at **prob-period-1** (`614ca675a78aef0900e7dd375fb85f398e1d7ee4`). The published tag remains fixed; this editorial revision is distributed from `main`. The old tag contains the earlier long PDF. The application source tree is unchanged. Summary diagrams and concise text link to their own source commit, while detailed specifications and evidence link to the project tag.

- Group: **SE-2414**.
- Team: **Adilzhan Amangeldi**, **Rustam Seitzhan**.
- Representative: **Adilzhan Amangeldi**.
- Scope: Parts 1–10 followed by References as Section 11, preserving the source-document order.

## Reproduce and verify

Check out the current report revision. Use Python 3.11+ and WeasyPrint's platform dependencies, including Pango:

```sh
python3 -m venv docs/DIP/report/.venv
docs/DIP/report/.venv/bin/pip install -r docs/DIP/report/requirements.txt
docs/DIP/report/.venv/bin/python docs/DIP/report/build_report.py
docs/DIP/report/.venv/bin/python docs/DIP/report/validate_report.py
```

`sections/` contains the concise editable Markdown. `diagrams/` contains matching PlantUML sources and exports. `report.json` declares the section order and maximum page count. `style.css` defines the layout. The builder chooses the last commit changing report source files for source links; commit source edits before generating the final PDF. It refuses to replace the PDF if the result exceeds 20 pages.

`source-manifest.json` records the PDF checksum, exact concise-source hashes, detailed-reference hashes at the frozen tag and the application tree identity. `_build/` contains ignored render intermediates. Historical test results retain their original source attribution; the report makes no new application test or deployment claim.
