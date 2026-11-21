# Vendored CampusCore connector

`connector/` is an unmodified copy of `campuscoresis/connector/src` (the reference connector shipped
by CampusCore SIS, package `@campuscore/edunexus-connector` 1.0.0), copied on 2026-10-12 and refreshed on
2026-10-23 (identity resolution per record type: one person may hold a STUDENT and a FACULTY link).

It is vendored rather than linked so EdunexusAI and CampusCore stay independently deployable.
Do not edit files in `connector/`; EdunexusAI-specific behaviour lives beside it in
`../campuscore*.js` and `src/modules/sis`. To update, copy the newer `connector/src` over this
folder and re-run `npm test`.

## Local additions (not yet in `campuscoresis/connector/src`)

The copy has drifted: EdunexusAI needed reads and writes before the reference connector gained them. Keep these when
refreshing, or port them upstream first:

- `getStudentAccount` (finance:read) and `SisPortalService.studentFinance`.
- `listStudentAnnouncements`, `listFacultyAnnouncements` (announcements:read) and `SisPortalService.studentAnnouncements`,
  `SisPortalService.facultyAnnouncements`.
- `createSectionAnnouncement` (announcements:write, Idempotency-Key, acting faculty from the verified link) and
  `SisPortalService.facultyPublishAnnouncement`, which re-checks the section assignment before posting.

Each is mirrored by a CampusCore integration API endpoint (`docs/INTEGRATION_CONTRACT.md` in `campuscoresis`).
