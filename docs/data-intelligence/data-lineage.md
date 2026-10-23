# FlowForge Data Intelligence — Data Lineage & Provenance

## 1. Lineage Graph Model

Lineage represents a directed acyclic graph (DAG) capturing the flow of information across FlowForge resources:

### Node Types
- **`WORKFLOW`**: FlowForge workflow definition or execution output.
- **`EVENT_SCHEMA`**: Phase 22 platform event definition.
- **`PROCESS`**: Phase 21 business process milestone.
- **`CONNECTOR`**: Phase 19 certified connector output.
- **`PIPELINE`**: Declarative data pipeline definition.
- **`DATA_PRODUCT`**: Governed data product version.

### Relationship Types
- **`PRODUCES`**: An execution or event creates an intermediate record.
- **`TRANSFORMS`**: A pipeline reads a data source and applies operations.
- **`MATERIALIZES`**: A pipeline run persists a snapshot for a data product.
- **`CONSUMES`**: A downstream workflow or application queries a data product.
- **`DEPENDS_ON`**: Downstream dependency between entities.

---

## 2. Graph Traversal & Cycle Prevention

The `dataLineageService` implements breadth-first search (BFS) graph traversal with:
- **Cycle Detection**: Tracking visited keys to eliminate infinite loops.
- **Bounded Depth**: Default max depth of 5 (configurable up to 10).
- **Strict Tenant Boundaries**: Graph edges and nodes are restricted exclusively to the requesting workspace.
