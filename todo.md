# TPVA-31: Build selection, revision and selected-plan UI

Owner role: M5
Target: Day 5 (2026-11-02)
Deliverable: Add select/edit actions and chosen-plan view.
Acceptance Criteria:

* [x] User selects and revises a plan; responsive UI.
  * [x] Plan selection action from comparison cards and plan detail view with persistence (`src/services/planSelection.js`).
  * [x] Chosen-plan view with status banner, export/copy tools, timeline, cost breakdown, and empty selection fallback (`src/pages/SelectedPlanPage.jsx`).
  * [x] Revision form and schema for budget, duration, dates, travelers, preferences, and limits (`src/components/revision/RevisionForm.jsx`, `src/components/revision/revisionSchema.js`).
  * [x] Dynamic feasibility re-evaluation and revision history log (`src/services/mockData.js`, `src/services/api.js`).
  * [x] Responsive design and print stylesheet across screen sizes (`src/index.css`).
  * [x] Unit tests for selection and revision features (`src/services/planSelection.test.mjs`, `src/components/revision/revision.test.mjs`).
