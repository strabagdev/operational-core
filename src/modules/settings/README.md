# Settings Module

Administrative settings configure contracts, users, entities, and AppViews for Opco Web.

PANEL AppViews are configured as modular compositions of datasets, filters, metrics, modules, and layout. In the current editor, entities remain the data source, datasets can use `RECORDS` or `LATEST_BY_RELATION`, and executable modules are `TABLE` and `KPI`. KPI modules reference declarative metrics; metrics support `COUNT`, `COUNT_VALUES`, `COUNT_DISTINCT`, `SUM`, `AVG`, `MIN`, and `MAX`. A metric's `filterIds` selects which optional panel filters affect that metric; required panel filters remain global for bound datasets. Chart, board, Gantt, text, formulas, and calculated fields are reserved for later stages and must not be persisted as active module types yet.

PANEL does not create an entity and does not store operational or transactional records. The settings form serializes the published `PanelConfig` contract used by `/api/v1`: dataset-level `source`, `filters`, `datasets`, `metrics`, `modules`, and empty reserved `calculatedFields`. Unknown properties are rejected until the contract publishes them explicitly.
