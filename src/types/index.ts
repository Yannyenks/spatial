/**
 * Core domain types for the AI Spatial Experience Platform.
 *
 * These types are the single source of truth for shapes shared between
 * services, API routes and the UI. Prisma generates its own model types;
 * these are the "business" shapes returned by services (often a subset or
 * a composition of Prisma models) so the rest of the app never depends on
 * the ORM directly.
 */

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

export type MemberRole = "OWNER" | "ADMIN" | "MEMBER";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: PlanId;
  createdAt: string;
}

export interface Membership {
  id: string;
  userId: string;
  organizationId: string;
  role: MemberRole;
}

// ---------------------------------------------------------------------------
// Billing / quotas
// ---------------------------------------------------------------------------

export type PlanId = "STARTER" | "PRO" | "BUSINESS" | "ENTERPRISE";

export interface PlanLimits {
  maxProjects: number;
  maxSpacesPerProject: number;
  maxStorageBytes: number;
  maxAiJobsPerMonth: number;
  maxVideoGenerationsPerMonth: number;
  maxMonthlyVisitors: number;
  customDomain: boolean;
  whiteLabel: boolean;
}

// ---------------------------------------------------------------------------
// Projects & spaces
// ---------------------------------------------------------------------------

export type ProjectType =
  | "HOTEL"
  | "VILLA"
  | "APARTMENT"
  | "REAL_ESTATE"
  | "RESTAURANT"
  | "OFFICE"
  | "HEALTHCARE"
  | "RETAIL"
  | "OTHER";

export type ProjectStatus = "DRAFT" | "CAPTURING" | "PROCESSING" | "READY" | "PUBLISHED";

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  coverImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Space {
  id: string;
  projectId: string;
  name: string;
  /** Free-form label, e.g. "Lobby", "Room 204", "Pool Deck". */
  kind: SpaceKind;
  order: number;
  coverAssetId: string | null;
  /** Semantic World Model containment (Building > Floor > Room), distinct from navigation edges. */
  parentSpaceId: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Semantic World Model / Spatial Knowledge Graph
// ---------------------------------------------------------------------------

/** Where a piece of spatial data came from (§46: never let INFERRED/GENERATED masquerade as REAL). */
export type Provenance = "REAL" | "COMPUTED" | "INFERRED" | "GENERATED";

export type RelationEntityType = "SPACE" | "OBJECT" | "CONCEPT";

/** A typed edge in the spatial knowledge graph, e.g. `Room 204 --overlooks--> Pool Deck`. */
export interface SpatialRelation {
  id: string;
  projectId: string;
  subjectType: Exclude<RelationEntityType, "CONCEPT">;
  subjectId: string;
  predicate: string;
  objectType: RelationEntityType;
  /** Set when objectType is SPACE or OBJECT. */
  objectId: string | null;
  /** Set when objectType is CONCEPT (a relation to a free-text idea not yet its own modeled object). */
  objectLabel: string | null;
  confidence: number;
  provenance: Provenance;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Spatial Query Engine (structured, non-LLM spatial search)
// ---------------------------------------------------------------------------

export interface SpatialQueryFilter {
  /** Restrict to spaces of this kind, e.g. "SUITE". */
  kind?: SpaceKind;
  /** Restrict to spaces directly under this parent space. */
  parentSpaceId?: string;
  /** Restrict to spaces that carry a relation with this predicate, e.g. "has". */
  hasRelation?: string;
  /** When hasRelation is set, further restrict to a specific object/concept, e.g. "balcony". */
  relationTarget?: string;
  /** Restrict to spaces reachable from this space within `maxHops` navigation edges. */
  nearSpaceId?: string;
  maxHops?: number;
}

export interface SpatialQueryMatch {
  space: Space;
  /** Present only when the query was a `nearSpaceId` search — hop count via the navigation graph. */
  distanceHops?: number;
  matchedRelations: SpatialRelation[];
}

export type SpaceKind =
  | "LOBBY"
  | "CORRIDOR"
  | "ROOM"
  | "SUITE"
  | "BATHROOM"
  | "RESTAURANT"
  | "POOL"
  | "GYM"
  | "OFFICE"
  | "OUTDOOR"
  | "OTHER";

/** A directed edge in the spatial navigation graph, per §14. */
export interface SpaceConnection {
  id: string;
  fromSpaceId: string;
  toSpaceId: string;
  position: Vector3 | null;
  direction: Vector3 | null;
  label: string | null;
}

// ---------------------------------------------------------------------------
// Assets & storage (§3, §34)
// ---------------------------------------------------------------------------

export type AssetKind =
  | "PHOTO"
  | "VIDEO"
  | "PHOTO_360"
  | "VIDEO_360"
  | "LIDAR"
  | "DEPTH"
  | "MODEL_3D";

export type StorageBucket =
  | "original"
  | "processed"
  | "thumbnails"
  | "reconstruction"
  | "experiences"
  | "generated";

export interface Asset {
  id: string;
  projectId: string;
  spaceId: string | null;
  kind: AssetKind;
  bucket: StorageBucket;
  storageKey: string;
  url: string;
  thumbnailUrl: string | null;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Spatial model (§11)
// ---------------------------------------------------------------------------

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface SpatialObject {
  id: string;
  sceneId: string;
  type: string;
  label?: string;
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
  confidence: number;
  /** §46/§13 (blueprint): REAL/COMPUTED data from observation vs INFERRED/GENERATED. */
  provenance: Provenance;
  metadata?: Record<string, unknown>;
}

export interface Scene {
  id: string;
  spaceId: string;
  objects: SpatialObject[];
  cameraPositions: Vector3[];
  navigationPoints: Vector3[];
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// AI jobs & processing pipeline (§3, §10, §31)
// ---------------------------------------------------------------------------

export type JobStage =
  | "QUEUED"
  | "MEDIA_VALIDATION"
  | "CAMERA_ANALYSIS"
  | "FRAME_EXTRACTION"
  | "SCENE_UNDERSTANDING"
  | "SPATIAL_RECONSTRUCTION"
  | "QUALITY_OPTIMIZATION"
  | "EXPERIENCE_GENERATION"
  | "COMPLETED"
  | "FAILED";

export type JobStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface AIJob {
  id: string;
  projectId: string;
  spaceId: string | null;
  provider: string;
  model: string;
  status: JobStatus;
  stage: JobStage;
  progress: number; // 0-100, derived only from completed pipeline steps
  error: JobError | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  costCents: number | null;
  createdAt: string;
}

export interface JobError {
  code: string;
  message: string;
  recoverable: boolean;
  suggestedAction?: string;
}

// ---------------------------------------------------------------------------
// Reconstruction & versioning (§12, §21)
// ---------------------------------------------------------------------------

export type ReconstructionMethod =
  | "MOCK"
  | "GAUSSIAN_SPLATTING"
  | "NERF"
  | "PHOTOGRAMMETRY"
  | "MESH"
  | "DEPTH_BASED";

export interface Reconstruction {
  id: string;
  projectId: string;
  spaceId: string;
  version: number;
  method: ReconstructionMethod;
  status: JobStatus;
  qualityScore: QualityScore | null;
  outputUri: string | null;
  isCurrent: boolean;
  /** Model registry (§27/§61 blueprint): which provider/model/job produced this version. */
  provider: string | null;
  model: string | null;
  sourceJobId: string | null;
  createdAt: string;
}

export interface QualityScore {
  overall: number;
  geometry: number;
  coverage: number;
  visualQuality: number;
  navigation: number;
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Experience & hotspots (§13-§15, §24-§25)
// ---------------------------------------------------------------------------

export type ExperienceVisibility = "PUBLIC" | "PRIVATE" | "PASSWORD_PROTECTED";

export interface Experience {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  visibility: ExperienceVisibility;
  passwordHash: string | null;
  branding: BrandingConfig;
  publishedAt: string | null;
  currentVersion: number;
  createdAt: string;
}

export interface BrandingConfig {
  logoUrl: string | null;
  accentColor: string | null;
  customDomain: string | null;
  hidePlatformBranding: boolean;
}

export type HotspotType =
  | "INFORMATION"
  | "IMAGE"
  | "VIDEO"
  | "ROOM"
  | "BOOKING"
  | "EXTERNAL_LINK"
  | "AI";

export interface Hotspot {
  id: string;
  spaceId: string;
  type: HotspotType;
  title: string;
  description: string | null;
  position: Vector3;
  targetSpaceId: string | null;
  externalUrl: string | null;
  mediaAssetId: string | null;
  order: number;
}

// ---------------------------------------------------------------------------
// AI concierge / spatial queries (§16-§17)
// ---------------------------------------------------------------------------

/** The only shapes an AI agent is allowed to emit; never free-form commands (§16). */
export type AgentAction =
  | { action: "navigate"; targetSpaceId: string }
  | { action: "highlight_hotspot"; hotspotId: string }
  | { action: "answer"; text: string }
  | { action: "no_action"; reason: string };

export interface AgentTurn {
  question: string;
  actions: AgentAction[];
  reasoningSummary?: string;
}

// ---------------------------------------------------------------------------
// AI Studio / generative media (§18-§19)
// ---------------------------------------------------------------------------

export type VideoGenerationFormat = "16:9" | "9:16" | "1:1";
export type VideoGenerationStyle = "LUXURY" | "CINEMATIC" | "EDITORIAL" | "NATURAL";

export interface VideoGenerationInput {
  projectId: string;
  spaceIds: string[];
  durationSeconds: number;
  format: VideoGenerationFormat;
  style: VideoGenerationStyle;
}

export type VideoGenerationStatusValue = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface VideoGenerationJob {
  id: string;
  projectId: string;
  provider: string;
  status: VideoGenerationStatusValue;
  input: VideoGenerationInput;
  outputUrl: string | null;
  error: JobError | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Analytics (§26)
// ---------------------------------------------------------------------------

export type AnalyticsEventName =
  | "experience_opened"
  | "space_viewed"
  | "hotspot_clicked"
  | "ai_question"
  | "booking_clicked"
  | "experience_completed";

export interface AnalyticsEvent {
  id: string;
  experienceId: string;
  name: AnalyticsEventName;
  sessionId: string;
  spaceId: string | null;
  hotspotId: string | null;
  metadata?: Record<string, unknown>;
  country: string | null;
  device: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Reconstruction engine abstraction inputs/outputs (§12)
// ---------------------------------------------------------------------------

export interface ReconstructionInput {
  projectId: string;
  spaceId: string;
  assets: Asset[];
}

export interface AnalysisResult {
  detectedObjects: SpatialObject[];
  cameraPositions: Vector3[];
  warnings: string[];
}

export interface ReconstructionResult {
  outputUri: string;
  method: ReconstructionMethod;
  scene: Scene;
}

export interface OptimizationInput {
  reconstructionId: string;
}

export interface OptimizationResult {
  qualityScore: QualityScore;
  optimizedOutputUri: string;
}
