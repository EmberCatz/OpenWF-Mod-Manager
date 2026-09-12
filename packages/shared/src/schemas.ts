// Runtime validation mirroring the interfaces in types.ts, for the one
// place they actually matter: parsing a Worker response on the client
// before trusting it. A blanket `as SomeType` cast is invisible to the
// compiler when the backend sends something unexpected (a stale deploy, a
// bad migration, a field renamed on one side and not the other) — it just
// lets bad data flow into components that assume the shape is right, which
// crashes render somewhere downstream. Parsing at the boundary turns that
// into one clear error at the fetch call instead.
//
// Kept by hand in sync with types.ts, same as types.ts is kept in sync
// with schema.sql — there's no single source of truth to generate this
// from, so a field added to one must be added to the other.
import { z } from "zod";

export const ModCategorySchema = z.enum(["metadata-patch", "pluto-script", "other"]);

export const ModVersionSchema = z.object({
  id: z.number(),
  modId: z.string(),
  version: z.string(),
  fileName: z.string(),
  downloadUrl: z.string(),
  fileSize: z.number(),
  checksum: z.string(),
  gameVersions: z.array(z.string()),
  changelog: z.string().nullable(),
  createdAt: z.string(),
});

export const ModSchema = z.object({
  id: z.string(),
  name: z.string(),
  author: z.string(),
  subAuthor: z.string().nullable(),
  ownerId: z.string(),
  description: z.string(),
  category: ModCategorySchema,
  theme: z.string(),
  thumbnailUrl: z.string().nullable(),
  thumbnailPosition: z.string(),
  screenshotUrls: z.array(z.string()),
  tags: z.array(z.string()),
  downloadCount: z.number(),
  commentCount: z.number(),
  likeCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ModWithVersionsSchema = ModSchema.extend({
  versions: z.array(ModVersionSchema),
});

export const CommentSchema = z.object({
  id: z.number(),
  modId: z.string(),
  parentId: z.number().nullable(),
  authorName: z.string(),
  authorAccountId: z.string().nullable(),
  body: z.string(),
  score: z.number(),
  myVote: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  createdAt: z.string(),
});

export const LikeSummarySchema = z.object({
  count: z.number(),
  liked: z.boolean(),
});

export const ModderProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatarKey: z.string(),
  createdAt: z.string(),
  mods: z.array(ModWithVersionsSchema),
});
