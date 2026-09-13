/**
 * Demo data seed (§37: "Demo Experience"). Creates a demo organization,
 * a "Hotel Riviera" project, five spaces, generated placeholder imagery
 * (not real photography — clearly a stand-in, honoring §33), a connected
 * navigation graph, hotspots, and a published public experience at
 * /experience/demo-hotel-riviera so the product's value is visible
 * end-to-end without requiring a real capture first.
 *
 * Run with: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import path from "path";
import { promises as fs } from "fs";
import { computeQualityScore } from "../src/services/quality-score.service";

const db = new PrismaClient();
const STORAGE_ROOT = path.join(process.cwd(), "storage");

const SPACE_DEFS = [
  { name: "Lobby", kind: "LOBBY", color: "#2f2a22" },
  { name: "Corridor", kind: "CORRIDOR", color: "#3a352b" },
  { name: "Suite 204", kind: "SUITE", color: "#8c6730" },
  { name: "Restaurant", kind: "RESTAURANT", color: "#4a4235" },
  { name: "Pool Deck", kind: "POOL", color: "#2e5f6b" },
] as const;

async function placeholderImage(label: string, color: string): Promise<Buffer> {
  const svg = `
    <svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${color}" />
          <stop offset="100%" stop-color="#0b0a08" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)" />
      <text x="60" y="740" font-family="Helvetica, Arial, sans-serif" font-size="42"
            fill="#f5f3ee" opacity="0.9">${label}</text>
      <text x="60" y="780" font-family="Helvetica, Arial, sans-serif" font-size="18"
            fill="#f5f3ee" opacity="0.5">Generated placeholder — demo content, not a real capture</text>
    </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

async function main() {
  console.log("Seeding demo data…");

  const email = "demo@spatial.app";
  const passwordHash = await bcrypt.hash("demo12345", 10);

  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, name: "Demo Host" },
  });

  const organization = await db.organization.upsert({
    where: { slug: "spatial-demos" },
    update: {},
    create: {
      name: "Spatial Demos",
      slug: "spatial-demos",
      plan: "BUSINESS",
      memberships: { create: { userId: user.id, role: "OWNER" } },
      subscription: { create: { plan: "BUSINESS", status: "ACTIVE" } },
    },
  });

  let project = await db.project.findFirst({ where: { organizationId: organization.id, name: "Hotel Riviera" } });
  if (!project) {
    project = await db.project.create({
      data: { organizationId: organization.id, name: "Hotel Riviera", type: "HOTEL", status: "DRAFT" },
    });
  }

  // Semantic World Model containment (Building > Floor > Room, §12/§17):
  // Suite 204 sits under a "Floor 2" space rather than directly under the
  // project, demonstrating the hierarchy independently of the navigation
  // graph below.
  let floor2 = await db.space.findFirst({ where: { projectId: project.id, name: "Floor 2" } });
  if (!floor2) {
    floor2 = await db.space.create({ data: { projectId: project.id, name: "Floor 2", kind: "OTHER", order: -1 } });
  }

  const spaces: Record<string, Awaited<ReturnType<typeof db.space.create>>> = {};
  for (const [i, def] of SPACE_DEFS.entries()) {
    const desiredParentId = def.name === "Suite 204" ? floor2.id : null;
    let space = await db.space.findFirst({ where: { projectId: project.id, name: def.name } });
    if (!space) {
      space = await db.space.create({
        data: { projectId: project.id, name: def.name, kind: def.kind, order: i, parentSpaceId: desiredParentId },
      });
    } else if (space.parentSpaceId !== desiredParentId) {
      // Re-running the seed against a database created before the
      // Semantic World Model hierarchy existed shouldn't leave stale data.
      space = await db.space.update({ where: { id: space.id }, data: { parentSpaceId: desiredParentId } });
    }
    spaces[def.name] = space;

    // Generate + store two placeholder photos per space, each with a real
    // thumbnail (§9 Asset System: original vs derived variants), matching
    // what a real upload through the app produces.
    for (let n = 0; n < 2; n++) {
      const buffer = await placeholderImage(def.name, def.color);
      const key = `${project.id}/${space.id}/placeholder-${n}.jpg`;
      const filePath = path.join(STORAGE_ROOT, "original", key);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, buffer);

      const thumbnailBuffer = await sharp(buffer).resize({ width: 480 }).jpeg({ quality: 72 }).toBuffer();
      const thumbPath = path.join(STORAGE_ROOT, "thumbnails", key);
      await fs.mkdir(path.dirname(thumbPath), { recursive: true });
      await fs.writeFile(thumbPath, thumbnailBuffer);

      const existing = await db.asset.findFirst({ where: { spaceId: space.id, storageKey: key } });
      if (!existing) {
        await db.asset.create({
          data: {
            projectId: project.id,
            spaceId: space.id,
            kind: "PHOTO",
            bucket: "original",
            storageKey: key,
            thumbnailKey: key,
            sizeBytes: buffer.byteLength,
            width: 1200,
            height: 800,
          },
        });
      }
    }

    // Mark a mock reconstruction as current, with a realistically computed
    // quality score (not a fake number, see quality-score.service.ts).
    const existingReconstruction = await db.reconstruction.findFirst({ where: { spaceId: space.id, isCurrent: true } });
    if (!existingReconstruction) {
      const quality = computeQualityScore({
        assetCount: 2,
        hasReconstructionOutput: true,
        hotspotCount: 1,
        connectionCount: 1,
      });
      await db.reconstruction.create({
        data: {
          projectId: project.id,
          spaceId: space.id,
          version: 1,
          method: "MOCK",
          status: "COMPLETED",
          isCurrent: true,
          qualityJson: JSON.stringify(quality),
          provider: "mock",
          model: "spatial-reconstruction-v0",
        },
      });
    }
  }

  // Navigation graph: Lobby <-> Corridor <-> {Suite 204, Restaurant}; Lobby <-> Pool Deck.
  const edges: [string, string][] = [
    ["Lobby", "Corridor"],
    ["Corridor", "Suite 204"],
    ["Corridor", "Restaurant"],
    ["Lobby", "Pool Deck"],
  ];
  for (const [from, to] of edges) {
    const exists = await db.spaceConnection.findFirst({
      where: { fromSpaceId: spaces[from]!.id, toSpaceId: spaces[to]!.id },
    });
    if (!exists) {
      await db.spaceConnection.create({ data: { fromSpaceId: spaces[from]!.id, toSpaceId: spaces[to]!.id } });
      await db.spaceConnection.create({ data: { fromSpaceId: spaces[to]!.id, toSpaceId: spaces[from]!.id } });
    }
  }

  // Hotspots.
  interface HotspotSeed {
    type: string;
    title: string;
    description?: string;
    externalUrl?: string;
    positionX: number;
    positionY: number;
    positionZ: number;
    order: number;
  }
  async function addHotspot(spaceName: keyof typeof spaces, data: HotspotSeed) {
    const space = spaces[spaceName]!;
    const exists = await db.hotspot.findFirst({ where: { spaceId: space.id, title: data.title } });
    if (!exists) await db.hotspot.create({ data: { ...data, spaceId: space.id } });
  }

  await addHotspot("Suite 204", {
    type: "INFORMATION",
    title: "Ocean View Suite",
    description: "King bed, private balcony, 42m².",
    positionX: 0,
    positionY: 0,
    positionZ: 0,
    order: 0,
  });
  await addHotspot("Suite 204", {
    type: "BOOKING",
    title: "Book this suite",
    description: "Check availability and rates.",
    externalUrl: "https://example.com/book/suite-204",
    positionX: 0.3,
    positionY: 0,
    positionZ: 0,
    order: 1,
  });
  await addHotspot("Pool Deck", {
    type: "INFORMATION",
    title: "Infinity Pool",
    description: "Heated, open 6am–10pm.",
    positionX: 0,
    positionY: 0,
    positionZ: 0,
    order: 0,
  });
  await addHotspot("Lobby", {
    type: "AI",
    title: "Ask the concierge",
    description: "Have a question? Tap to ask our AI concierge.",
    positionX: 0,
    positionY: 0,
    positionZ: 0,
    order: 0,
  });

  // Spatial Knowledge Graph relations (§12/§17/§20): human-authored, so
  // provenance is REAL — the owner is asserting real facts about the
  // property, not the AI inferring them from pixels.
  async function addRelation(
    subjectName: keyof typeof spaces,
    predicate: string,
    target: { objectType: "SPACE" | "CONCEPT"; spaceName?: keyof typeof spaces; label?: string }
  ) {
    const subject = spaces[subjectName]!;
    const objectId = target.objectType === "SPACE" ? spaces[target.spaceName!]!.id : undefined;
    const exists = await db.spatialRelation.findFirst({
      where: { projectId: project!.id, subjectId: subject.id, predicate, objectLabel: target.label, objectId },
    });
    if (!exists) {
      await db.spatialRelation.create({
        data: {
          projectId: project!.id,
          subjectType: "SPACE",
          subjectId: subject.id,
          predicate,
          objectType: target.objectType,
          objectId,
          objectLabel: target.label,
          confidence: 1,
          provenance: "REAL",
        },
      });
    }
  }

  await addRelation("Suite 204", "has", { objectType: "CONCEPT", label: "balcony" });
  await addRelation("Suite 204", "has", { objectType: "CONCEPT", label: "ocean view" });
  await addRelation("Suite 204", "overlooks", { objectType: "SPACE", spaceName: "Pool Deck" });
  await addRelation("Pool Deck", "has", { objectType: "CONCEPT", label: "infinity pool" });

  // Publish.
  await db.experience.upsert({
    where: { projectId: project.id },
    update: { publishedAt: new Date() },
    create: {
      projectId: project.id,
      name: "Hotel Riviera — Virtual Experience",
      slug: "demo-hotel-riviera",
      visibility: "PUBLIC",
      publishedAt: new Date(),
      currentVersion: 1,
    },
  });
  await db.project.update({ where: { id: project.id }, data: { status: "PUBLISHED" } });

  console.log("Seed complete.");
  console.log(`  Sign in with: ${email} / demo12345`);
  console.log(`  Public demo: /experience/demo-hotel-riviera`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
