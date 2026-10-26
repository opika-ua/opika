import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * K-Q2's conditions that live in what the code never does, so only a scan of
 * the source can hold them (Oleksii, verbatim: "no code path that overwrites
 * or deletes an existing object"; "re-encode strips ALL metadata"):
 *
 * - no S3 call that deletes, copies over, or schedules the deletion of an
 *   object exists anywhere - **except** `r2-cleanup-client.ts`, the GDPR
 *   photo-retention job's own client (`docs/gdpr-analysis.md`,
 *   `docs/decisions-inbox/feat-r2-photo-cleanup.md`, R2-B1: his approval of
 *   the design that made this job the one named exception). That file's own
 *   commands are checked separately, below, against its own narrower
 *   allowlist - never folded into the general "no destructive calls" check,
 *   which still holds for every other file unchanged;
 * - no SDK command but `PutObjectCommand` is named in any other non-test
 *   source, and `@aws-sdk/lib-storage` (multipart uploads, which assemble
 *   an object from copied parts) appears in none;
 * - the AWS SDK is imported in exactly two source files (`r2-client.ts`,
 *   put-only, and `r2-cleanup-client.ts`, list-and-delete-only), each as
 *   exactly its own named set from `@aws-sdk/client-s3`, so the first rule
 *   has two places to look, never a third; `r2-client.ts`'s put carries
 *   `IfNoneMatch` (P-Q11). Each file's own test is the one other importer,
 *   held to the same import;
 * - nothing in the image pipeline asks sharp to keep or write metadata;
 * - no `apps/web` module imports the server pipeline statically: it is loaded
 *   inside the upload handler (`import()`), which keeps sharp and the S3
 *   client out of every bundle `next build` evaluates.
 *
 * Every non-test source file in the repo is read (TypeScript and JavaScript,
 * scripts included), not a list kept here.
 */

const REPO = resolve(fileURLToPath(import.meta.url), "../../../../..");
const SKIP = new Set(["node_modules", ".next", "dist", "coverage", "test-results", ".git"]);

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP.has(name) ? [] : sources(path);
    return /\.(tsx?|mjs|cjs|js)$/.test(name) ? [path] : [];
  });

const all = ["apps", "packages"].flatMap((root) =>
  sources(join(REPO, root)).map((file) => ({
    path: relative(REPO, file).replaceAll("\\", "/"),
    text: readFileSync(file, "utf8"),
  })),
);
const isTest = (path: string) => /\.test\.tsx?$/.test(path);
const nonTest = all.filter((file) => !isTest(file.path));
/** This file names every forbidden call in its own bypass cases, so it scans everything but itself. */
const SELF = "apps/web/src/kabinet/photo-pipeline-scan.test.ts";
const others = all.filter((file) => file.path !== SELF);

const R2_CLIENT = "packages/db/src/image-pipeline/r2-client.ts";
const R2_CLIENT_TEST = "packages/db/src/image-pipeline/r2-client.test.ts";
const R2_CLEANUP_CLIENT = "packages/db/src/image-pipeline/r2-cleanup-client.ts";
const R2_CLEANUP_CLIENT_TEST = "packages/db/src/image-pipeline/r2-cleanup-client.test.ts";
const PIPELINE_DIR = "packages/db/src/image-pipeline/";

/** Each check as a function over files, so the bypass cases below run the same code. */
const DESTRUCTIVE = /\b(DeleteObject|CopyObject|PutBucketLifecycle|DeleteBucket)\w*/;
const filesWithDestructiveCalls = (files: readonly { path: string; text: string }[]) =>
  files.filter((file) => DESTRUCTIVE.test(file.text)).map((file) => file.path);

/**
 * A file's code without its comment lines, so a comment naming the SDK (as
 * `index.ts`'s and `server.ts`'s do) is not mistaken for an import.
 */
const codeOf = (text: string) =>
  text
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join("\n");

/**
 * Any module specifier under `@aws-sdk/`, in any quoting: a static or dynamic
 * import, a re-export, a require, or a string kept for a later `import(name)`.
 */
const AWS_SDK_SPECIFIER = /["'`]@aws-sdk\/[^"'`]*["'`]/g;
const filesImportingAwsSdk = (files: readonly { path: string; text: string }[]) =>
  files
    .filter((file) => (codeOf(file.text).match(AWS_SDK_SPECIFIER) ?? []).length > 0)
    .map((file) => file.path);

/**
 * The names a file imports from the SDK, sorted, or null unless its whole SDK
 * use is one named import from `@aws-sdk/client-s3`. An alias comes back as
 * written (`X as Y`), so it fails an exact match rather than hiding a name.
 */
const sdkImportNamesOf = (text: string): string[] | null => {
  const code = codeOf(text);
  const specifiers = code.match(AWS_SDK_SPECIFIER) ?? [];
  const named = [...code.matchAll(/\bimport\s*\{([^}]*)\}\s*from\s*"@aws-sdk\/client-s3"/g)];
  if (specifiers.length !== 1 || named.length !== 1) return null;
  return (named[0]?.[1] ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "")
    .sort();
};

/**
 * Every `…Command` identifier but `PutObjectCommand`, comments included.
 * `AdminCommand` is the operator CLI's own type (`packages/db/src/admin.ts`,
 * a union of its subcommand names), not an SDK command; the scan checks it is
 * still declared there, so the exemption can't come to cover something else.
 */
const COMMAND_NAME = /\b[A-Z][A-Za-z0-9]*Command\b/g;
const NOT_SDK_COMMANDS = new Set(["PutObjectCommand", "AdminCommand"]);
const otherCommandNamesIn = (files: readonly { path: string; text: string }[]) =>
  files.flatMap((file) =>
    [...new Set(file.text.match(COMMAND_NAME) ?? [])]
      .filter((name) => !NOT_SDK_COMMANDS.has(name))
      .map((name) => `${file.path}: ${name}`),
  );

const LIB_STORAGE = /@aws-sdk\/lib-storage/;
const filesNamingLibStorage = (files: readonly { path: string; text: string }[]) =>
  files.filter((file) => LIB_STORAGE.test(file.text)).map((file) => file.path);

const KEEPS_METADATA =
  /\.(withMetadata|keepMetadata|keepExif|keepXmp|keepIptc|keepIccProfile|withExif|withExifMerge|withXmp|withIccProfile)\s*\(/;
const pipelineFilesKeepingMetadata = (files: readonly { path: string; text: string }[]) =>
  files
    .filter((file) => file.path.startsWith(PIPELINE_DIR) && KEEPS_METADATA.test(file.text))
    .map((file) => file.path);

/** `import … from "@opika/db/image-pipeline/server"` that isn't `import type`. */
const STATIC_SERVER_IMPORT =
  /^\s*import\s+(?!type\b)[^;]*?from\s+["']@opika\/db\/image-pipeline\/server["']/m;
const webFilesImportingServerPipeline = (files: readonly { path: string; text: string }[]) =>
  files
    .filter((file) => file.path.startsWith("apps/web/") && STATIC_SERVER_IMPORT.test(file.text))
    .map((file) => file.path);

describe("the photo pipeline's never-rules (K-Q2, P-Q11)", () => {
  it("sanity: the scan reads the pipeline, the upload handler and the onboarding script", () => {
    expect(all.length).toBeGreaterThan(200);
    expect(nonTest.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        R2_CLIENT,
        `${PIPELINE_DIR}generate-variants.ts`,
        `${PIPELINE_DIR}prepare-uploaded-photo.ts`,
        "apps/web/src/kabinet/handlers/photos.ts",
        "packages/db/src/onboard-shelter.ts",
      ]),
    );
  });

  it("no source file deletes, copies or schedules the deletion of an object, except the one named GDPR job", () => {
    const othersExceptCleanup = others.filter(
      (file) => file.path !== R2_CLEANUP_CLIENT && file.path !== R2_CLEANUP_CLIENT_TEST,
    );
    expect(filesWithDestructiveCalls(othersExceptCleanup)).toEqual([]);
  });

  it("the named exception's own destructive calls are exactly DeleteObjectsCommand, nothing wider", () => {
    for (const path of [R2_CLEANUP_CLIENT, R2_CLEANUP_CLIENT_TEST]) {
      const text = all.find((file) => file.path === path)?.text ?? "";
      expect(text, path).not.toBe("");
      expect(
        [
          ...new Set(
            text.match(/\b(DeleteObject|CopyObject|PutBucketLifecycle|DeleteBucket)\w*/g) ?? [],
          ),
        ],
        path,
      ).toEqual(["DeleteObjectsCommand"]);
    }
  });

  it("only r2-client.ts and r2-cleanup-client.ts (and their own tests) import anything from @aws-sdk/*", () => {
    expect(filesImportingAwsSdk(others).sort()).toEqual(
      [R2_CLIENT, R2_CLIENT_TEST, R2_CLEANUP_CLIENT, R2_CLEANUP_CLIENT_TEST].sort(),
    );
  });

  it("r2-client.ts (and its test) import exactly { PutObjectCommand, S3Client } from client-s3", () => {
    for (const path of [R2_CLIENT, R2_CLIENT_TEST]) {
      const text = all.find((file) => file.path === path)?.text ?? "";
      expect(text, path).not.toBe("");
      expect(sdkImportNamesOf(text), path).toEqual(["PutObjectCommand", "S3Client"]);
    }
  });

  it("r2-cleanup-client.ts (and its test) import exactly { DeleteObjectsCommand, ListObjectsV2Command, S3Client }", () => {
    for (const path of [R2_CLEANUP_CLIENT, R2_CLEANUP_CLIENT_TEST]) {
      const text = all.find((file) => file.path === path)?.text ?? "";
      expect(text, path).not.toBe("");
      expect(sdkImportNamesOf(text), path).toEqual([
        "DeleteObjectsCommand",
        "ListObjectsV2Command",
        "S3Client",
      ]);
    }
  });

  it("no non-test source names an SDK command but PutObjectCommand, or lib-storage, outside the named exception", () => {
    const nonTestExceptCleanup = nonTest.filter((file) => file.path !== R2_CLEANUP_CLIENT);
    expect(otherCommandNamesIn(nonTestExceptCleanup)).toEqual([]);
    expect(filesNamingLibStorage(nonTest)).toEqual([]);
    const admin = all.find((file) => file.path === "packages/db/src/admin.ts")?.text ?? "";
    expect(admin).toMatch(/export type AdminCommand = "/);
  });

  it("the named exception names only its own two commands, nothing else", () => {
    const CLEANUP_COMMANDS = new Set(["DeleteObjectsCommand", "ListObjectsV2Command"]);
    const text = all.find((file) => file.path === R2_CLEANUP_CLIENT)?.text ?? "";
    const names = [...new Set(text.match(COMMAND_NAME) ?? [])];
    expect(names.filter((name) => !CLEANUP_COMMANDS.has(name))).toEqual([]);
    expect([...CLEANUP_COMMANDS].every((name) => names.includes(name))).toBe(true);
  });

  it("r2-client.ts's put refuses to overwrite: IfNoneMatch: *", () => {
    const text = all.find((file) => file.path === R2_CLIENT)?.text ?? "";
    expect(text).toMatch(/IfNoneMatch:\s*"\*"/);
    expect(text.match(/new PutObjectCommand\(/g)).toHaveLength(1);
  });

  it("nothing in the image pipeline keeps or writes metadata", () => {
    expect(pipelineFilesKeepingMetadata(nonTest)).toEqual([]);
  });

  it("apps/web loads the server pipeline only dynamically (or as types)", () => {
    expect(webFilesImportingServerPipeline(nonTest)).toEqual([]);
    const handler = all.find((file) => file.path === "apps/web/src/kabinet/handlers/photos.ts");
    expect(handler?.text).toContain('import("@opika/db/image-pipeline/server")');
  });

  it("each check catches what it exists to catch", () => {
    const file = (path: string, text: string) => ({ path, text });
    expect(
      filesWithDestructiveCalls([
        file("a.ts", "await client.send(new DeleteObjectCommand({ Bucket, Key }));"),
        file("b.ts", "new CopyObjectCommand({})"),
        file("c.ts", "PutBucketLifecycleConfigurationCommand"),
        file("d.ts", "DeleteObjectsCommand"),
        file("e.ts", "new PutObjectCommand({ IfNoneMatch: '*' })"),
      ]),
    ).toEqual(["a.ts", "b.ts", "c.ts", "d.ts"]);
    expect(
      filesImportingAwsSdk([
        file("x.ts", 'import { S3Client } from "@aws-sdk/client-s3";'),
        file("y.ts", 'const s3 = await import("@aws-sdk/client-s3");'),
        file("z.ts", 'import { Upload } from "@aws-sdk/lib-storage";'),
        file("t.ts", "const m = await import(`@aws-sdk/client-s3`);"),
        file("r.ts", 'export { S3Client } from "@aws-sdk/client-s3";'),
        file("q.ts", 'const { S3Client } = require("@aws-sdk/client-s3");'),
        file("c.ts", "/**\n * `createR2Client` (`@aws-sdk/client-s3`) lives elsewhere.\n */"),
        file("n.ts", 'import { createR2Client } from "./r2-client";'),
      ]),
    ).toEqual(["x.ts", "y.ts", "z.ts", "t.ts", "r.ts", "q.ts"]);
    expect(
      [
        'import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";',
        'import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";',
        'import { PutObjectCommand, S3Client, UploadPartCopyCommand } from "@aws-sdk/client-s3";',
        'import { DeleteObjectCommand as PutObjectCommand, S3Client } from "@aws-sdk/client-s3";',
        'import * as s3 from "@aws-sdk/client-s3";',
        'import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";\nimport { Upload } from "@aws-sdk/lib-storage";',
        'import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";\nconst x = await import("@aws-sdk/client-s3");',
      ].map(sdkImportNamesOf),
    ).toEqual([
      ["PutObjectCommand", "S3Client"],
      ["PutObjectCommand", "S3Client"],
      ["PutObjectCommand", "S3Client", "UploadPartCopyCommand"],
      ["DeleteObjectCommand as PutObjectCommand", "S3Client"],
      null,
      null,
      null,
    ]);
    expect(
      otherCommandNamesIn([
        file("a.ts", "new PutObjectCommand({}); type T = AdminCommand;"),
        file("b.ts", "client.send(new UploadPartCopyCommand(input));"),
        file("c.ts", "await client.send(new CompleteMultipartUploadCommand(input));"),
        file("d.ts", "// a comment naming DeleteObjectCommand counts too"),
      ]),
    ).toEqual([
      "b.ts: UploadPartCopyCommand",
      "c.ts: CompleteMultipartUploadCommand",
      "d.ts: DeleteObjectCommand",
    ]);
    expect(
      filesNamingLibStorage([
        file("a.ts", 'import { Upload } from "@aws-sdk/lib-storage";'),
        file("b.ts", 'import { S3Client } from "@aws-sdk/client-s3";'),
      ]),
    ).toEqual(["a.ts"]);
    expect(
      pipelineFilesKeepingMetadata([
        file(`${PIPELINE_DIR}a.ts`, "sharp(source).rotate().withMetadata().webp()"),
        file(`${PIPELINE_DIR}b.ts`, "sharp(source).keepExif()"),
        file(`${PIPELINE_DIR}c.ts`, "sharp(source).webp()"),
      ]),
    ).toEqual([`${PIPELINE_DIR}a.ts`, `${PIPELINE_DIR}b.ts`]);
    expect(
      webFilesImportingServerPipeline([
        file("apps/web/a.ts", 'import { createR2Client } from "@opika/db/image-pipeline/server";'),
        file("apps/web/b.ts", 'import type { R2Config } from "@opika/db/image-pipeline/server";'),
        file("apps/web/c.ts", 'const p = await import("@opika/db/image-pipeline/server");'),
      ]),
    ).toEqual(["apps/web/a.ts"]);
  });
});
