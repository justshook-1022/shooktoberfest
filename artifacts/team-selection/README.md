# Team-selection workbook

This folder preserves the team-selection output originally stored outside the website repository. The workbook and roster are a September 11, 2026 snapshot and do not automatically update from the live event.

- [Shooktoberfest Team Selection.xlsx](Shooktoberfest%20Team%20Selection.xlsx): editable team-selection workbook.
- [preview.png](preview.png): rendered workbook preview.
- [roster.json](roster.json): source roster and course handicaps.
- [build.mjs](build.mjs): original workbook generator.
- `Shooktoberfest Team Selection.xlsx.inspect.ndjson`: saved workbook inspection output.

The finished workbook opens directly in Excel or another compatible spreadsheet app. The original generator uses `@oai/artifact-tool` from the Codex spreadsheet runtime; this dependency is separate from the website's npm dependencies. The website's build and tests do not require it.
