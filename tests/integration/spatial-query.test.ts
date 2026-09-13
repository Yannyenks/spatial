import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { registerUser } from "@/services/auth.service";
import { createOrganizationForUser } from "@/services/organization.service";
import { createProject } from "@/services/project.service";
import { createSpace, connectSpaces } from "@/services/space.service";
import { createRelation } from "@/services/spatial-graph.service";
import { findSpaces, calculateHopDistance } from "@/services/spatial-query.service";

describe("Spatial Query Engine (§13/§21) and Semantic World Model (§12)", () => {
  it("finds spaces by a real relation, not by guessing", async () => {
    const user = await registerUser(`query1-${Date.now()}@example.com`, "password123");
    const org = await createOrganizationForUser(user.id, "Query Org 1");
    const project = await createProject(user.id, org.id, "Query Hotel", "HOTEL");
    const roomWithBalcony = await createSpace(user.id, project.id, "Suite 204", "SUITE");
    await createSpace(user.id, project.id, "Room 101", "ROOM");

    await createRelation(user.id, project.id, {
      subjectType: "SPACE",
      subjectId: roomWithBalcony.id,
      predicate: "has",
      objectType: "CONCEPT",
      objectLabel: "balcony",
    });

    const matches = await findSpaces(project.id, { hasRelation: "has", relationTarget: "balcony" });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.space.id).toBe(roomWithBalcony.id);
  });

  it("never returns a space that lacks the relation", async () => {
    const user = await registerUser(`query2-${Date.now()}@example.com`, "password123");
    const org = await createOrganizationForUser(user.id, "Query Org 2");
    const project = await createProject(user.id, org.id, "Query Hotel 2", "HOTEL");
    await createSpace(user.id, project.id, "Room 101", "ROOM");

    const matches = await findSpaces(project.id, { hasRelation: "has", relationTarget: "jacuzzi" });
    expect(matches).toHaveLength(0);
  });

  it("computes hop distance via real graph traversal", async () => {
    const user = await registerUser(`query3-${Date.now()}@example.com`, "password123");
    const org = await createOrganizationForUser(user.id, "Query Org 3");
    const project = await createProject(user.id, org.id, "Query Hotel 3", "HOTEL");
    const lobby = await createSpace(user.id, project.id, "Lobby", "LOBBY");
    const corridor = await createSpace(user.id, project.id, "Corridor", "CORRIDOR");
    const room = await createSpace(user.id, project.id, "Room 204", "ROOM");

    await connectSpaces(user.id, project.id, lobby.id, corridor.id);
    await connectSpaces(user.id, project.id, corridor.id, room.id);

    const hops = await calculateHopDistance(project.id, lobby.id, room.id);
    expect(hops).toBe(2);

    const unreachable = await db.space.create({ data: { projectId: project.id, name: "Isolated", kind: "OTHER" } });
    const noPath = await calculateHopDistance(project.id, lobby.id, unreachable.id);
    expect(noPath).toBeNull();
  });

  it("respects the Semantic World Model containment hierarchy (parentSpaceId)", async () => {
    const user = await registerUser(`query4-${Date.now()}@example.com`, "password123");
    const org = await createOrganizationForUser(user.id, "Query Org 4");
    const project = await createProject(user.id, org.id, "Query Hotel 4", "HOTEL");
    const floor2 = await createSpace(user.id, project.id, "Floor 2", "OTHER");
    const room = await createSpace(user.id, project.id, "Room 204", "ROOM", floor2.id);
    await createSpace(user.id, project.id, "Room 101", "ROOM"); // no parent

    const matches = await findSpaces(project.id, { parentSpaceId: floor2.id });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.space.id).toBe(room.id);
  });
});
