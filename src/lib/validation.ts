import { z } from "zod";

export const registerSchema = z.object({
  // The name field on the register form is optional and starts as "" in
  // React state, so the client always submits a string (never omits the
  // key) — .min(1) here would reject every signup that skips their name.
  // An empty name is meaningless, not invalid, so we just don't validate
  // a minimum length; registerUser() already treats "" as "no name".
  name: z.string().max(120).optional(),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  organizationName: z.string().min(1).max(120),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const projectTypeSchema = z.enum([
  "HOTEL",
  "VILLA",
  "APARTMENT",
  "REAL_ESTATE",
  "RESTAURANT",
  "OFFICE",
  "HEALTHCARE",
  "RETAIL",
  "OTHER",
]);

export const createProjectSchema = z.object({
  name: z.string().min(1).max(120),
  type: projectTypeSchema,
});

export const spaceKindSchema = z.enum([
  "LOBBY",
  "CORRIDOR",
  "ROOM",
  "SUITE",
  "BATHROOM",
  "RESTAURANT",
  "POOL",
  "GYM",
  "OFFICE",
  "OUTDOOR",
  "OTHER",
]);

export const createSpaceSchema = z.object({
  name: z.string().min(1).max(120),
  kind: spaceKindSchema,
  /** Semantic World Model containment parent, e.g. a Floor space for a Room. */
  parentSpaceId: z.string().optional(),
});

export const connectSpacesSchema = z.object({
  fromSpaceId: z.string().min(1),
  toSpaceId: z.string().min(1),
  label: z.string().max(120).optional(),
});

export const hotspotTypeSchema = z.enum([
  "INFORMATION",
  "IMAGE",
  "VIDEO",
  "ROOM",
  "BOOKING",
  "EXTERNAL_LINK",
  "AI",
]);

export const createHotspotSchema = z.object({
  type: hotspotTypeSchema,
  title: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  targetSpaceId: z.string().optional(),
  externalUrl: z.string().url().optional(),
  mediaAssetId: z.string().optional(),
});

export const publishExperienceSchema = z.object({
  name: z.string().min(1).max(160),
  visibility: z.enum(["PUBLIC", "PRIVATE", "PASSWORD_PROTECTED"]),
  password: z.string().min(4).max(200).optional(),
  branding: z
    .object({
      logoUrl: z.string().url().nullable().optional(),
      accentColor: z.string().max(20).nullable().optional(),
      customDomain: z.string().max(255).nullable().optional(),
      hidePlatformBranding: z.boolean().optional(),
    })
    .optional(),
});

export const analyticsEventSchema = z.object({
  name: z.enum([
    "experience_opened",
    "space_viewed",
    "hotspot_clicked",
    "ai_question",
    "booking_clicked",
    "experience_completed",
  ]),
  sessionId: z.string().min(1).max(120),
  spaceId: z.string().optional(),
  hotspotId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const conciergeQuestionSchema = z.object({
  question: z.string().min(1).max(500),
});

export const videoGenerationSchema = z.object({
  spaceIds: z.array(z.string()).min(1),
  durationSeconds: z.number().min(5).max(60),
  format: z.enum(["16:9", "9:16", "1:1"]),
  style: z.enum(["LUXURY", "CINEMATIC", "EDITORIAL", "NATURAL"]),
});
