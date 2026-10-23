# FlowForge Integration Marketplace Architecture & Specification

## 1. Executive Overview

The FlowForge Integration Marketplace transforms FlowForge into an extensible ecosystem. It serves as a unified discovery catalog where workspace operators can explore, preview, install, and update certified platform connectors and community-contributed custom integrations.

All packages listed in the marketplace operate strictly on FlowForge's declarative connector model (`HTTP` action specifications and standardized webhook trigger schemas). Untrusted arbitrary runtime code execution is completely prohibited by design.

---

## 2. Core Architectural Pillars

### 2.1 Declarative Integration Model
Marketplace integrations are serialized as JSON schema specifications:
- **Base URL & Authentication**: Defined as declarative template strings (Bearer, Basic, API Key in header/query, or OAuth2).
- **Triggers**: Standardized webhook schema definitions and signature verification specifications.
- **Actions**: Explicit HTTP endpoint configurations with strict parameter typing, query bindings, and JSON body templates.

### 2.2 Version-Pinned Workspace Installations
When an integration is installed into a workspace:
- An entry in `MarketplaceInstallation` links the `Workspace` to the `MarketplaceListing`.
- The workspace is pinned to an immutable semantic version (e.g., `installedVersion = 1`).
- Workflows executing nodes from this integration reference the immutable version definition, preventing upstream breaking changes from disrupting active production workloads.
- Workspace administrators can explicitly review release notes and trigger manual upgrades.

### 2.3 Explicit Activation Model
Installing an integration does **NOT** automatically activate or bind credentials. Workflows cannot execute actions against an external service until:
1. The integration package is installed in the workspace.
2. A workspace member provisions an encrypted connection (`ConnectedAccount`) with valid secrets.
3. The workflow author maps the node to that authenticated account.

---

## 3. Database Schema

The marketplace is supported by two primary relational models in `packages/database/prisma/schema.prisma`:

### `MarketplaceListing`
```prisma
model MarketplaceListing {
  id                  String             @id @default(uuid())
  slug                String             @unique
  title               String
  description         String
  category            String
  authorId            String?
  publisherName       String
  isVerified          Boolean            @default(false)
  isFeatured          Boolean            @default(false)
  reviewStatus        ListingReviewStatus @default(DRAFT)
  currentVersion      Int                @default(1)
  iconUrl             String?
  accentColor         String?
  documentationUrl    String?
  authRequirements    String
  supportedTriggers   Json               @default("[]")
  supportedActions    Json               @default("[]")
  specDefinition      Json
  rejectionReason     String?
  deprecationNotice   String?
  installCount        Int                @default(0)
  rating              Float              @default(5.0)
  createdAt           DateTime           @default(now())
  updatedAt           DateTime           @updatedAt
  publishedAt         DateTime?

  author              User?              @relation(fields: [authorId], references: [id])
  installations       MarketplaceInstallation[]
}
```

### `MarketplaceInstallation`
```prisma
model MarketplaceInstallation {
  id                  String             @id @default(uuid())
  workspaceId         String
  listingId           String
  installedVersion    Int
  autoUpdate          Boolean            @default(false)
  installedAt         DateTime           @default(now())
  updatedAt           DateTime           @updatedAt

  workspace           Workspace          @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  listing             MarketplaceListing @relation(fields: [listingId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, listingId])
}
```

---

## 4. API Endpoints

- `GET /api/v1/marketplace/listings`: Paginated catalog with category, keyword search, verification, and installation status filters.
- `GET /api/v1/marketplace/listings/:id`: Detailed listing metadata, changelog, and supported actions.
- `POST /api/v1/marketplace/listings/:id/install`: Installs listing pinned to current or requested version.
- `POST /api/v1/marketplace/listings/:id/uninstall`: Uninstalls listing from workspace.
- `POST /api/v1/marketplace/listings`: Submits a custom declarative integration for publishing.
- `POST /api/v1/marketplace/listings/:id/review`: Admin-only endpoint to approve or reject submissions.
- `POST /api/v1/marketplace/listings/:id/deprecate`: Marks listing deprecated with mandatory migration notices.
