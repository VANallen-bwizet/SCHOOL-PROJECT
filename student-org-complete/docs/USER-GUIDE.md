# User guide

## Start
Open student-org-complete in VS Code and run npm.cmd start. If dependencies are missing, run npm.cmd install first. SQLite needs no separate server. The first launch creates 100 simulated students and 6 organizations in a separate database from the original backup.

## Main pages
- Overview: student, organization, and membership totals.
- Members: choose a student and organization, then join or remove membership. Changes are saved. Recalculate earlier results after edits.
- Set laboratory: union, intersection, differences, subset, superset, complement, and power sets. Cardinality means the number of unique elements. Power sets accept up to 10 unique student IDs.
- Analytics: participation counts, Jaccard similarity, overlap rankings, and recommendations. Selected interests are temporary; suggestions do not join clubs automatically.
- Committees: choose eligible organizations, exclusions, and committee size. No include choices means all students. Exclusions take priority.
- Verification: select A and B to check both De Morgan laws and inspect their IDs.
- Performance: compare list and hash-set lookup times.

## Duplicate cleanup
Paste studentId,organizationId pairs, one per line. Cleanup changes the pasted text only; saved memberships already prevent duplicates. Joining different organizations is valid.

## Reports and data
Export current dataset saves the live records as JSON. Bundled CSV/JSON files are the starting dataset, not current edits.

Run npm.cmd test for checks or npm.cmd run reports to refresh baseline reports. Neither command changes the live database. Use Tab and Enter/Space for keyboard controls.
  