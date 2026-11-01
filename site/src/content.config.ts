/**
 * 레슨 컬렉션. frontmatter 규격은 docs/LESSON_TEMPLATE.md §2.
 * 규격을 어기면 빌드가 실패한다 (레슨이 들쭉날쭉해지는 것을 막는 장치).
 */
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const fnName = z.string().regex(/^[a-zA-Z_]\w*$/, "함수명은 core/mine/wNN.ts의 export 이름과 같아야 한다");

const session = z.object({
  id: z.string().regex(/^[a-z]\w*$/),
  device: z.enum(["phone", "pad", "pc"]),
  title: z.string().min(1),
});

const lessons = defineCollection({
  loader: glob({ pattern: "w[0-9][0-9]-*.mdx", base: "./src/content/lessons" }),
  schema: z
    .object({
      week: z.number().int().min(0),
      title: z.string().min(1),
      summary: z.string().min(1),
      prereq: z.array(z.string().regex(/^w\d{2}$/)).default([]),
      la_box: z.array(z.string()).default([]),
      tasks: z.array(fnName).default([]),
      read_only: z.array(fnName).default([]),
      deliverables: z.array(z.string()).default([]),
      demo: z.string().optional(),
      jetbot: z.boolean().default(false),
      units: z.number().positive(),
      sessions: z.array(session).min(1),
    })
    .refine((d) => new Set(d.sessions.map((s) => s.id)).size === d.sessions.length, {
      message: "sessions id가 중복된다",
      path: ["sessions"],
    })
    .refine((d) => !d.tasks.some((t) => d.read_only.includes(t)), {
      message: "같은 함수가 tasks와 read_only에 동시에 있다",
      path: ["read_only"],
    }),
});

export const collections = { lessons };
