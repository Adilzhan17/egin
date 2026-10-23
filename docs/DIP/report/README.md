# Probation Period 1 report

The submission file is [SE-2414_Amangeldi_ProbPeriod1.pdf](SE-2414_Amangeldi_ProbPeriod1.pdf), for group **SE-2414**, with **Adilzhan Amangeldi** as representative and **Rustam Seitzhan** as the second team member.

The compiler combines the ten numbered documents in `docs/DIP` followed by `REFERENCES.md` as Section 11. This is the order available in the supplied repository materials. It does not infer an additional section from an unavailable external rubric. The removed defense-preparation document is not part of the report.

The PDF contains a linked contents page, bookmarks, page numbers, selectable text, version-pinned repository links, diagram source links, and interface captures with their evidence limitations. Wide tables and diagrams use landscape pages; tall mobile captures are split into labelled panels without altering the source screenshots.

## Reproduce

Check out `prob-period-1` to validate or reproduce the published submission. The committed PDF and its source manifest describe that frozen version; `main` may contain subsequent documentation changes.

From the repository root, use Python 3.11+ and the platform libraries required by WeasyPrint (including Pango):

```sh
python3 -m venv docs/DIP/report/.venv
docs/DIP/report/.venv/bin/pip install -r docs/DIP/report/requirements.txt
docs/DIP/report/.venv/bin/python docs/DIP/report/build_report.py
docs/DIP/report/.venv/bin/python docs/DIP/report/validate_report.py
```

`report.json` defines the title-page information, filename, section order and `prob-period-1` tag. `style.css` defines the layout. `source-manifest.json` records the exact input hashes and PDF checksum. `_build/` contains temporary HTML and screenshot panels and is ignored by Git.

Historical checks remain attributed to their original inspection revision. The live prototype can change independently; the tagged source and capture metadata are the versioned evidence.
