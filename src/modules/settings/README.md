# Settings Module

Administrative settings configure contracts, users, entities, and AppViews for Opco Web.

PANEL AppViews are configured as modular compositions of datasets, filters, modules, and layout. In the current editor, entities remain the data source, datasets can use `RECORDS` or `LATEST_BY_RELATION`, and `TABLE` is the only executable module. KPI, chart, board, Gantt, text, metrics, and calculated fields are reserved for later stages and must not be persisted as active module types yet.

PANEL does not create an entity and does not store operational or transactional records. The settings form serializes the published `PanelConfig` contract used by `/api/v1`: dataset-level `source`, `filters`, `datasets`, `modules`, and empty reserved `metrics` and `calculatedFields`. Unknown properties are rejected until the contract publishes them explicitly.
