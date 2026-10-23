"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import {
  Database,
  Layers,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Play,
  RotateCw,
  Plus,
  Search,
  Filter,
  Shield,
  ArrowRight,
  GitBranch,
  Table,
  Eye,
  Check,
  AlertCircle,
  FileCode,
  Tag,
  Share2,
} from "lucide-react";

export default function DataProductsPage() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"CATALOG" | "DETAIL" | "PIPELINES" | "LINEAGE" | "QUALITY" | "QUERY">("CATALOG");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modals
  const [createProductModalOpen, setCreateProductModalOpen] = useState(false);
  const [createPipelineModalOpen, setCreatePipelineModalOpen] = useState(false);
  const [createRuleModalOpen, setCreateRuleModalOpen] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewResults, setPreviewResults] = useState<any>(null);

  // Form states
  const [newProductSlug, setNewProductSlug] = useState("");
  const [newProductName, setNewProductName] = useState("");
  const [newProductDomain, setNewProductDomain] = useState("SALES");
  const [newProductCriticality, setNewProductCriticality] = useState("HIGH");
  const [newProductClassification, setNewProductClassification] = useState("INTERNAL");
  const [newProductSchemaJson, setNewProductSchemaJson] = useState('{\n  "type": "object",\n  "properties": {\n    "orderId": { "type": "string" },\n    "amount": { "type": "number" },\n    "status": { "type": "string" }\n  },\n  "required": ["orderId", "amount"]\n}');

  // Pipeline form state
  const [newPipelineSlug, setNewPipelineSlug] = useState("");
  const [newPipelineName, setNewPipelineName] = useState("");
  const [newPipelineSourceId, setNewPipelineSourceId] = useState("");
  const [newPipelineRefreshMode, setNewPipelineRefreshMode] = useState("FULL_REFRESH");

  // Rule form state
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleType, setNewRuleType] = useState("REQUIRED_FIELD");
  const [newRuleField, setNewRuleField] = useState("orderId");
  const [newRuleSeverity, setNewRuleSeverity] = useState("ERROR");
  const [newRuleBlocking, setNewRuleBlocking] = useState(true);

  // Publish form state
  const [overrideQualityGate, setOverrideQualityGate] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  // Query tab state
  const [queryFilterField, setQueryFilterField] = useState("");
  const [queryFilterOp, setQueryFilterOp] = useState("EQUALS");
  const [queryFilterVal, setQueryFilterVal] = useState("");
  const [queryLimit, setQueryLimit] = useState(25);
  const [queryResults, setQueryResults] = useState<any>(null);

  // 1. Fetch Data Products
  const { data: productsData, isLoading: loadingProducts, refetch: refetchProducts } = useQuery({
    queryKey: ["data-products", domainFilter, statusFilter, searchQuery],
    queryFn: () =>
      api.dataProducts.list({
        businessDomain: domainFilter || undefined,
        lifecycleStatus: statusFilter || undefined,
        search: searchQuery || undefined,
      }),
  });

  const products = productsData?.data || [];

  // Selected product detail
  const { data: productDetailData, refetch: refetchDetail } = useQuery({
    queryKey: ["data-product-detail", selectedProductId],
    queryFn: () => (selectedProductId ? api.dataProducts.get(selectedProductId) : null),
    enabled: Boolean(selectedProductId),
  });

  const selectedProduct = productDetailData?.data || (products.length > 0 ? products[0] : null);

  // 2. Fetch Data Sources
  const { data: sourcesData } = useQuery({
    queryKey: ["data-sources"],
    queryFn: () => api.dataSources.list(),
  });
  const dataSources = sourcesData?.data || [];

  // 3. Fetch Pipelines
  const { data: pipelinesData, refetch: refetchPipelines } = useQuery({
    queryKey: ["data-pipelines", selectedProduct?.id],
    queryFn: () => api.dataPipelines.list({ dataProductId: selectedProduct?.id }),
    enabled: Boolean(selectedProduct?.id),
  });
  const pipelines = pipelinesData?.data || [];

  // 4. Fetch Quality Rules
  const { data: qualityRulesData, refetch: refetchRules } = useQuery({
    queryKey: ["data-quality-rules", selectedProduct?.id],
    queryFn: () => (selectedProduct?.id ? api.dataQuality.listRules(selectedProduct.id) : null),
    enabled: Boolean(selectedProduct?.id),
  });
  const qualityRules = qualityRulesData?.data || [];

  // 5. Fetch Lineage Graph
  const { data: lineageData } = useQuery({
    queryKey: ["data-lineage", selectedProduct?.slug],
    queryFn: () =>
      api.dataLineage.getGraph({
        rootNodeKey: selectedProduct ? `product:${selectedProduct.slug}` : undefined,
        direction: "BOTH",
        maxDepth: 4,
      }),
    enabled: activeTab === "LINEAGE",
  });
  const lineage = lineageData?.data || { nodes: [], edges: [] };

  // Mutations
  const createProductMutation = useMutation({
    mutationFn: (payload: any) => api.dataProducts.create(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["data-products"] });
      setCreateProductModalOpen(false);
      setSelectedProductId(res.data.id);
      setActiveTab("DETAIL");
    },
  });

  const publishVersionMutation = useMutation({
    mutationFn: ({ productId, version, body }: any) =>
      api.dataProducts.publishVersion(productId, version, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-products"] });
      queryClient.invalidateQueries({ queryKey: ["data-product-detail"] });
      setPublishModalOpen(false);
    },
  });

  const createPipelineMutation = useMutation({
    mutationFn: (payload: any) => api.dataPipelines.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-pipelines"] });
      setCreatePipelineModalOpen(false);
    },
  });

  const runPipelineMutation = useMutation({
    mutationFn: ({ pipelineId, options }: any) =>
      api.dataPipelines.run(pipelineId, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-pipelines"] });
      queryClient.invalidateQueries({ queryKey: ["data-products"] });
      queryClient.invalidateQueries({ queryKey: ["data-product-detail"] });
      queryClient.invalidateQueries({ queryKey: ["data-quality-rules"] });
    },
  });

  const previewPipelineMutation = useMutation({
    mutationFn: ({ pipelineId, sampleSize }: any) =>
      api.dataPipelines.preview(pipelineId, sampleSize),
    onSuccess: (res) => {
      setPreviewResults(res.data);
      setPreviewModalOpen(true);
    },
  });

  const createRuleMutation = useMutation({
    mutationFn: ({ productId, body }: any) =>
      api.dataQuality.createRule(productId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-quality-rules"] });
      setCreateRuleModalOpen(false);
    },
  });

  const executeQueryMutation = useMutation({
    mutationFn: ({ productId, body }: any) =>
      api.dataProducts.query(productId, body),
    onSuccess: (res) => {
      setQueryResults(res.data);
    },
  });

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const initialSchema = JSON.parse(newProductSchemaJson);
      createProductMutation.mutate({
        slug: newProductSlug,
        name: newProductName,
        businessDomain: newProductDomain,
        criticality: newProductCriticality,
        dataClassification: newProductClassification,
        initialSchema,
      });
    } catch {
      alert("Invalid JSON schema definition.");
    }
  };

  const handleCreatePipeline = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    createPipelineMutation.mutate({
      slug: newPipelineSlug,
      name: newPipelineName,
      dataProductId: selectedProduct.id,
      sourceId: newPipelineSourceId || undefined,
      refreshMode: newPipelineRefreshMode,
    });
  };

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    createRuleMutation.mutate({
      productId: selectedProduct.id,
      body: {
        name: newRuleName,
        ruleType: newRuleType,
        configuration: { field: newRuleField },
        severity: newRuleSeverity,
        isBlocking: newRuleBlocking,
      },
    });
  };

  const handleRunQuery = () => {
    if (!selectedProduct) return;
    const filter =
      queryFilterField && queryFilterVal
        ? { field: queryFilterField, operator: queryFilterOp, value: queryFilterVal }
        : undefined;
    executeQueryMutation.mutate({
      productId: selectedProduct.id,
      body: {
        filter,
        limit: queryLimit,
      },
    });
  };

  return (
    <AppShell
      title="Governed Data Intelligence Platform"
      description="Transform workflow executions, business events, and connector metrics into trustworthy, reusable data products."
      action={
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetchProducts()}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            onClick={() => setCreateProductModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#6558E8] rounded-xl hover:bg-[#5345D8] shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Data Product
          </button>
        </div>
      }
    >
      {/* Navigation Tabs */}
      <div className="flex items-center border-b border-slate-200/90 bg-white px-4 rounded-t-2xl overflow-x-auto">
        {[
          { id: "CATALOG", label: "Data Catalog", icon: Database },
          { id: "DETAIL", label: "Product Detail & Schemas", icon: FileCode },
          { id: "PIPELINES", label: "Pipeline Studio", icon: Layers },
          { id: "LINEAGE", label: "Lineage Explorer", icon: GitBranch },
          { id: "QUALITY", label: "Quality & Governance", icon: Shield },
          { id: "QUERY", label: "Data Explorer", icon: Table },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 py-3.5 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer shrink-0 ${
                isActive
                  ? "border-[#6558E8] text-[#6558E8]"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="p-6">
        {/* ======================================================== */}
        {/* TAB 1: DATA PRODUCT CATALOG */}
        {/* ======================================================== */}
        {activeTab === "CATALOG" && (
          <div className="space-y-6">
            {/* Search & Filters */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search data products by name or slug..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <select
                  value={domainFilter}
                  onChange={(e) => setDomainFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">All Domains</option>
                  <option value="SALES">Sales</option>
                  <option value="MARKETING">Marketing</option>
                  <option value="OPERATIONS">Operations</option>
                  <option value="FINANCE">Finance</option>
                  <option value="SECURITY">Security</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">All Statuses</option>
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="DEPRECATED">Deprecated</option>
                  <option value="RETIRED">Retired</option>
                </select>
              </div>
              <div className="text-xs text-slate-500 font-medium">
                Showing {products.length} registered data products
              </div>
            </div>

            {/* Catalog Grid */}
            {loadingProducts ? (
              <div className="py-16 text-center text-slate-500 text-xs">Loading data products...</div>
            ) : products.length === 0 ? (
              <div className="py-16 text-center bg-white rounded-xl border border-dashed border-slate-300 p-8">
                <Database className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-slate-800">No Data Products Found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Create your first governed data product to establish traceable, documented datasets from workflow executions.
                </p>
                <button
                  onClick={() => setCreateProductModalOpen(true)}
                  className="mt-4 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                >
                  Create Data Product
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {products.map((p: any) => {
                  const statusColors: Record<string, string> = {
                    PUBLISHED: "bg-emerald-50 text-emerald-700 border-emerald-200",
                    DRAFT: "bg-amber-50 text-amber-700 border-amber-200",
                    DEPRECATED: "bg-slate-100 text-slate-600 border-slate-300",
                    RETIRED: "bg-red-50 text-red-600 border-red-200",
                  };
                  const qualityColors: Record<string, string> = {
                    PASS: "bg-emerald-50 text-emerald-700",
                    WARN: "bg-amber-50 text-amber-700",
                    FAIL: "bg-red-50 text-red-700",
                    INSUFFICIENT_DATA: "bg-slate-100 text-slate-500",
                  };

                  return (
                    <div
                      key={p.id}
                      className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:border-indigo-300 transition-all cursor-pointer flex flex-col justify-between"
                      onClick={() => {
                        setSelectedProductId(p.id);
                        setActiveTab("DETAIL");
                      }}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase rounded border bg-indigo-50 text-indigo-700 border-indigo-200">
                            {p.businessDomain}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
                              statusColors[p.lifecycleStatus] || "bg-slate-50 text-slate-600"
                            }`}
                          >
                            {p.lifecycleStatus}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600">{p.name}</h4>
                        <p className="text-[11px] text-slate-500 font-mono mt-0.5">{p.slug}</p>
                        <p className="text-xs text-slate-600 mt-2 line-clamp-2">
                          {p.description || "No description provided for this governed data product."}
                        </p>
                      </div>

                      <div className="mt-5 pt-3 border-t border-slate-100 space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">Quality Gate:</span>
                          <span
                            className={`px-2 py-0.5 rounded font-semibold ${
                              qualityColors[p.qualityStatus] || "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {p.qualityStatus}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>Version:</span>
                          <span className="font-semibold text-slate-700">v{p.currentVersion}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>Snapshots / Pipelines:</span>
                          <span className="font-medium text-slate-700">
                            {p._count?.snapshots || 0} / {p._count?.pipelines || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: PRODUCT DETAIL & SCHEMAS */}
        {/* ======================================================== */}
        {activeTab === "DETAIL" && selectedProduct && (
          <div className="space-y-6">
            {/* Header Banner */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded border bg-indigo-50 text-indigo-700 border-indigo-200">
                      {selectedProduct.businessDomain}
                    </span>
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                      {selectedProduct.lifecycleStatus}
                    </span>
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-100 text-slate-700">
                      v{selectedProduct.currentVersion}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">{selectedProduct.name}</h2>
                  <p className="text-xs text-slate-500 font-mono">{selectedProduct.slug}</p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedProduct.lifecycleStatus !== "PUBLISHED" && (
                    <button
                      onClick={() => setPublishModalOpen(true)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm"
                    >
                      Publish Version
                    </button>
                  )}
                  <button
                    onClick={() => setActiveTab("QUERY")}
                    className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100"
                  >
                    Query Dataset
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-4 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Data Classification:</span>
                  <span className="font-semibold text-slate-800">{selectedProduct.dataClassification}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Quality Status:</span>
                  <span className="font-semibold text-emerald-700">{selectedProduct.qualityStatus}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Canonical Hash:</span>
                  <span className="font-mono text-slate-700 text-[11px] truncate block max-w-[180px]">
                    {selectedProduct.canonicalHash || "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Last Materialized:</span>
                  <span className="text-slate-700">
                    {selectedProduct.lastMaterializedAt
                      ? new Date(selectedProduct.lastMaterializedAt).toLocaleString()
                      : "Never"}
                  </span>
                </div>
              </div>
            </div>

            {/* Versions & Materialized Snapshots */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Schema Versions */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-indigo-600" />
                  Schema Versions
                </h3>
                <div className="space-y-3">
                  {selectedProduct.versions?.map((v: any) => (
                    <div key={v.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-800">Version {v.version}</span>
                        <span className="px-2 py-0.5 text-[10px] rounded font-semibold bg-white border text-slate-700">
                          {v.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">{v.changeSummary || "Initial schema definition"}</p>
                      <pre className="mt-2 p-2 bg-slate-900 text-slate-100 text-[10px] font-mono rounded overflow-x-auto max-h-36">
                        {JSON.stringify(v.schemaDefinition, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>

              {/* Materialized Snapshots */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <Table className="w-4 h-4 text-indigo-600" />
                  Materialized Snapshots
                </h3>
                {selectedProduct.snapshots?.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">
                    No snapshots materialized yet. Execute a pipeline to populate this product.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {selectedProduct.snapshots?.map((s: any) => (
                      <div key={s.id} className="p-3 rounded-lg border border-slate-200 bg-white flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800">{s.recordCount} Records</span>
                            <span className="text-[10px] text-slate-500">({(s.byteSize / 1024).toFixed(1)} KB)</span>
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {new Date(s.materializedAt).toLocaleString()}
                          </span>
                        </div>
                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {s.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: PIPELINE STUDIO */}
        {/* ======================================================== */}
        {activeTab === "PIPELINES" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Declarative Transformation Pipelines</h3>
                <p className="text-xs text-slate-500">
                  Pipelines extract records from authorized sources and transform them into governed snapshots.
                </p>
              </div>
              <button
                onClick={() => setCreatePipelineModalOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                New Pipeline
              </button>
            </div>

            {pipelines.length === 0 ? (
              <div className="py-12 bg-white rounded-xl border border-dashed border-slate-300 text-center p-6">
                <Layers className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <h4 className="text-xs font-bold text-slate-700">No Pipelines Configured</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Create a pipeline to bind an authorized source to this data product.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {pipelines.map((pipe: any) => (
                  <div key={pipe.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{pipe.name}</h4>
                        <span className="text-[11px] text-slate-500 font-mono">
                          Source: {pipe.source?.name || "Direct Feed"} ({pipe.source?.sourceType})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => previewPipelineMutation.mutate({ pipelineId: pipe.id, sampleSize: 10 })}
                          className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                        >
                          Dry-Run Preview
                        </button>
                        <button
                          onClick={() => runPipelineMutation.mutate({ pipelineId: pipe.id, options: { runType: "MANUAL" } })}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 flex items-center gap-1.5"
                        >
                          <Play className="w-3 h-3" />
                          Execute Pipeline
                        </button>
                      </div>
                    </div>

                    {/* Recent Runs */}
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <span className="text-[11px] font-bold text-slate-700 block mb-2">Recent Execution Runs:</span>
                      {pipe.runs?.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No execution history recorded yet.</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {pipe.runs?.map((r: any) => (
                            <div key={r.id} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-slate-800">{r.runType}</span>
                                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${r.status === "SUCCESS" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                  {r.status}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Written: {r.recordsWritten} rows ({r.durationMs || 0}ms)
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 4: LINEAGE EXPLORER */}
        {/* ======================================================== */}
        {activeTab === "LINEAGE" && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-indigo-600" />
                End-to-End Lineage Graph
              </h3>
              <p className="text-xs text-slate-500">
                Visual provenance graph tracing raw operational sources through transformation pipelines to governed data products.
              </p>
            </div>

            {/* Lineage Node Visualizer */}
            <div className="p-6 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-center gap-8">
                {lineage.nodes?.map((node: any, idx: number) => (
                  <div key={node.nodeKey} className="flex items-center gap-4">
                    <div className="p-4 bg-white rounded-xl border-2 border-indigo-500 shadow-md min-w-[180px]">
                      <span className="px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-indigo-50 text-indigo-700 block w-fit mb-1">
                        {node.nodeType}
                      </span>
                      <h5 className="text-xs font-bold text-slate-900">{node.name}</h5>
                      <span className="text-[10px] text-slate-400 font-mono block mt-1">{node.nodeKey}</span>
                    </div>
                    {idx < (lineage.nodes.length - 1) && (
                      <ArrowRight className="w-5 h-5 text-indigo-400" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Downstream Impact Summary */}
            <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-100 text-xs">
              <span className="font-bold text-indigo-900 block mb-1">Downstream Dependency Impact:</span>
              <p className="text-indigo-700">
                Any breaking schema changes will evaluate impact on registered downstream consumers and connected workflows.
              </p>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 5: DATA QUALITY & GOVERNANCE */}
        {/* ======================================================== */}
        {activeTab === "QUALITY" && selectedProduct && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Data Quality Rules & Quality Gates</h3>
                <p className="text-xs text-slate-500">
                  Enforce quality rules before product publication to prevent downstream schema drift or corrupted datasets.
                </p>
              </div>
              <button
                onClick={() => setCreateRuleModalOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Quality Rule
              </button>
            </div>

            {qualityRules.length === 0 ? (
              <div className="py-12 bg-white rounded-xl border border-dashed border-slate-300 text-center p-6">
                <Shield className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <h4 className="text-xs font-bold text-slate-700">No Quality Rules Defined</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Configure validation rules like required fields, null rates, and numeric ranges.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {qualityRules.map((rule: any) => {
                  const lastEval = rule.evaluations?.[0];
                  return (
                    <div key={rule.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-slate-100 text-slate-700">
                          {rule.ruleType}
                        </span>
                        <span className={`px-2 py-0.5 text-[10px] font-semibold rounded ${rule.isBlocking ? "bg-red-50 text-red-700 border border-red-200" : "bg-slate-50 text-slate-600"}`}>
                          {rule.isBlocking ? "Blocking Gate" : "Advisory"}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-900">{rule.name}</h4>
                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">Latest Evaluation:</span>
                        <span className={`font-semibold ${lastEval?.status === "PASS" ? "text-emerald-700" : lastEval?.status === "FAIL" ? "text-red-700" : "text-slate-500"}`}>
                          {lastEval ? `${lastEval.status} (${lastEval.recordsPassed}/${lastEval.recordsEvaluated})` : "Not evaluated"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 6: DATA EXPLORER & QUERY */}
        {/* ======================================================== */}
        {activeTab === "QUERY" && selectedProduct && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Query Published Dataset</h3>
              <p className="text-xs text-slate-500">
                Bounded, read-only query access to the latest materialized snapshot of {selectedProduct.name}.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <input
                type="text"
                placeholder="Filter field (e.g. status)"
                value={queryFilterField}
                onChange={(e) => setQueryFilterField(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
              />
              <select
                value={queryFilterOp}
                onChange={(e) => setQueryFilterOp(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
              >
                <option value="EQUALS">EQUALS</option>
                <option value="NOT_EQUALS">NOT EQUALS</option>
                <option value="GREATER_THAN">GREATER THAN</option>
                <option value="LESS_THAN">LESS THAN</option>
                <option value="CONTAINS">CONTAINS</option>
              </select>
              <input
                type="text"
                placeholder="Value (e.g. SUCCESS)"
                value={queryFilterVal}
                onChange={(e) => setQueryFilterVal(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
              />
              <button
                onClick={handleRunQuery}
                disabled={executeQueryMutation.isPending}
                className="px-4 py-1.5 font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
              >
                {executeQueryMutation.isPending ? "Executing..." : "Run Query"}
              </button>
            </div>

            {/* Results Table */}
            {queryResults ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Found {queryResults.total} total matching records (showing {queryResults.records.length})</span>
                  <span>Snapshot from {new Date(queryResults.snapshot?.materializedAt).toLocaleString()}</span>
                </div>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        {queryResults.records.length > 0 &&
                          Object.keys(queryResults.records[0]).map((col) => (
                            <th key={col} className="p-2.5 font-bold uppercase tracking-wider text-[10px]">
                              {col}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {queryResults.records.map((row: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50/50">
                          {Object.values(row).map((val: any, j: number) => (
                            <td key={j} className="p-2.5 text-slate-700 font-mono text-[11px]">
                              {typeof val === "object" ? JSON.stringify(val) : String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-xs text-slate-400">
                Click "Run Query" to fetch materialized records.
              </div>
            )}
          </div>
        )}
      </div>

      {/* CREATE DATA PRODUCT MODAL */}
      {createProductModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Create Governed Data Product</h3>
            <p className="text-xs text-slate-500 mb-4">
              Register a reusable data product with a documented schema and governance classification.
            </p>
            <form onSubmit={handleCreateProduct} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Slug (Identifier)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. daily-order-summary"
                  value={newProductSlug}
                  onChange={(e) => setNewProductSlug(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Product Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Daily Order Summary"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Business Domain</label>
                  <select
                    value={newProductDomain}
                    onChange={(e) => setNewProductDomain(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="SALES">Sales</option>
                    <option value="OPERATIONS">Operations</option>
                    <option value="FINANCE">Finance</option>
                    <option value="MARKETING">Marketing</option>
                    <option value="SECURITY">Security</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Classification</label>
                  <select
                    value={newProductClassification}
                    onChange={(e) => setNewProductClassification(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="PUBLIC">Public</option>
                    <option value="INTERNAL">Internal</option>
                    <option value="CONFIDENTIAL">Confidential</option>
                    <option value="RESTRICTED">Restricted</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">JSON Schema Definition</label>
                <textarea
                  rows={4}
                  value={newProductSchemaJson}
                  onChange={(e) => setNewProductSchemaJson(e.target.value)}
                  className="w-full p-2 font-mono text-[11px] border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCreateProductModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createProductMutation.isPending}
                  className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700"
                >
                  {createProductMutation.isPending ? "Creating..." : "Create Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PUBLISH VERSION MODAL */}
      {publishModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Publish Data Product Version</h3>
            <p className="text-xs text-slate-500 mb-4">
              Publishing version {selectedProduct.currentVersion} makes it available to approved consumers and marks it immutable.
            </p>
            <div className="space-y-4 text-xs">
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-800">
                <span className="font-bold block mb-1">Quality Gate Verification</span>
                Enabled quality rules will be evaluated on the latest snapshot. If rules fail, publication will be halted.
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="override"
                  checked={overrideQualityGate}
                  onChange={(e) => setOverrideQualityGate(e.target.checked)}
                />
                <label htmlFor="override" className="font-semibold text-slate-700">
                  Override Quality Gate (Requires justification)
                </label>
              </div>
              {overrideQualityGate && (
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Override Reason</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Approved emergency fix"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPublishModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() =>
                    publishVersionMutation.mutate({
                      productId: selectedProduct.id,
                      version: selectedProduct.currentVersion,
                      body: { overrideQualityGate, overrideReason },
                    })
                  }
                  disabled={publishVersionMutation.isPending}
                  className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700"
                >
                  {publishVersionMutation.isPending ? "Publishing..." : "Confirm Publication"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
