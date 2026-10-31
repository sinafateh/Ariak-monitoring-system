import test from "node:test";
import assert from "node:assert/strict";
import { splitProject } from "./workspace-repository.js";

test("project normalization separates panels and image bytes while retaining project metadata", () => {
  const image = `data:image/png;base64,${Buffer.from("image-bytes").toString("base64")}`;
  const source = {
    id: "project-a",
    name: "Site A",
    image,
    panels: [{ id: "panel-a", name: "Panel A" }],
    images: [{ id: "gallery-a", src: image, name: "Plan" }],
  };

  const normalized = splitProject(source);
  assert.equal(normalized.project.id, "project-a");
  assert.equal(normalized.project.name, "Site A");
  assert.equal(normalized.project.image, "");
  assert.equal(normalized.project.coverImageId, normalized.project.images[0].storedImageId);
  assert.equal(normalized.project.images[0].src, undefined);
  assert.equal(normalized.panels[0].id, "panel-a");
  assert.equal(normalized.images.length, 1);
  assert.equal(normalized.images[0].data.toString(), "image-bytes");
  assert.equal(source.image, image, "normalization does not mutate the caller's project");
});

test("project image normalization rejects oversized data URLs", () => {
  const oversized = `data:image/png;base64,${Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64")}`;
  assert.throws(() => splitProject({ id: "project-a", image: oversized, panels: [] }), /5 MB/);
});
