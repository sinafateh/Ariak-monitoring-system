import { createHash } from "node:crypto";

const DATA_IMAGE = /^data:image\/(png|jpeg|jpg|webp|gif|avif|bmp);base64,([A-Za-z0-9+/]+={0,2})$/i;
const IMAGE_BYTE_LIMIT = 5 * 1024 * 1024;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function imageRecord(source, images) {
  const match = typeof source === "string" ? DATA_IMAGE.exec(source) : null;
  if (!match) return null;
  const data = Buffer.from(match[2], "base64");
  if (!data.length || data.length > IMAGE_BYTE_LIMIT) throw new Error("Project image exceeds the 5 MB storage limit");
  const imageId = createHash("sha256").update(data).digest("hex");
  if (!images.has(imageId))
    images.set(imageId, {
      id: imageId,
      mimeType: match[1].toLowerCase() === "jpg" ? "jpeg" : match[1].toLowerCase(),
      data,
    });
  return imageId;
}

export function splitProject(project) {
  const source = clone(project);
  const panels = Array.isArray(source.panels) ? source.panels : [];
  const images = new Map();
  delete source.panels;

  const coverImageId = imageRecord(source.image, images);
  if (coverImageId) {
    source.image = "";
    source.coverImageId = coverImageId;
  } else {
    delete source.coverImageId;
  }

  if (Array.isArray(source.images)) {
    source.images = source.images.map((item) => {
      const image = typeof item === "string" ? { id: "", src: item } : { ...item };
      const imageId = imageRecord(image.src || image.image, images);
      if (imageId) {
        delete image.src;
        delete image.image;
        image.storedImageId = imageId;
      }
      return image;
    });
  }
  return { project: source, panels, images: [...images.values()] };
}

function assembleProject(record, panelRows, imageRows) {
  const project = clone(record.project_data);
  const images = new Map(
    imageRows.map((row) => [
      row.image_id,
      `data:image/${row.mime_type};base64,${Buffer.from(row.image_data).toString("base64")}`,
    ]),
  );
  if (project.coverImageId) {
    project.image = images.get(project.coverImageId) || project.image || "";
    delete project.coverImageId;
  }
  if (Array.isArray(project.images)) {
    project.images = project.images.map((item) => {
      if (!item?.storedImageId) return item;
      const { storedImageId, ...rest } = item;
      return { ...rest, src: images.get(storedImageId) || "" };
    });
  }
  project.panels = panelRows.map((row) => clone(row.panel_data));
  return project;
}

export async function loadWorkspaceProjects(client, workspaceKey, { lock = false } = {}) {
  const projectRows = await client.query(
    `SELECT project_id,project_data,position FROM app_projects WHERE workspace_key=$1 ORDER BY position,project_id${lock ? " FOR UPDATE" : ""}`,
    [workspaceKey],
  );
  if (!projectRows.rowCount) return [];
  const panelRows = await client.query(
    "SELECT project_id,panel_id,panel_data,position FROM app_project_panels WHERE workspace_key=$1 ORDER BY project_id,position,panel_id",
    [workspaceKey],
  );
  const imageRows = await client.query(
    "SELECT project_id,image_id,mime_type,image_data FROM app_project_images WHERE workspace_key=$1",
    [workspaceKey],
  );
  const panelsByProject = new Map();
  const imagesByProject = new Map();
  for (const row of panelRows.rows) {
    if (!panelsByProject.has(row.project_id)) panelsByProject.set(row.project_id, []);
    panelsByProject.get(row.project_id).push(row);
  }
  for (const row of imageRows.rows) {
    if (!imagesByProject.has(row.project_id)) imagesByProject.set(row.project_id, []);
    imagesByProject.get(row.project_id).push(row);
  }
  return projectRows.rows.map((row) =>
    assembleProject(row, panelsByProject.get(row.project_id) || [], imagesByProject.get(row.project_id) || []),
  );
}

export async function saveWorkspaceProjects(client, workspaceKey, projects) {
  const projectIds = projects.map((project) => String(project.id));
  await client.query("DELETE FROM app_projects WHERE workspace_key=$1 AND NOT (project_id=ANY($2::text[]))", [
    workspaceKey,
    projectIds,
  ]);
  for (const [position, source] of projects.entries()) {
    const projectId = String(source.id);
    const split = splitProject(source);
    await client.query(
      `INSERT INTO app_projects(workspace_key,project_id,project_data,position,updated_at)
       VALUES($1,$2,$3::jsonb,$4,NOW())
       ON CONFLICT(workspace_key,project_id) DO UPDATE SET project_data=EXCLUDED.project_data,position=EXCLUDED.position,updated_at=NOW()`,
      [workspaceKey, projectId, JSON.stringify(split.project), position],
    );
    await client.query("DELETE FROM app_project_panels WHERE workspace_key=$1 AND project_id=$2", [
      workspaceKey,
      projectId,
    ]);
    await client.query("DELETE FROM app_project_images WHERE workspace_key=$1 AND project_id=$2", [
      workspaceKey,
      projectId,
    ]);
    for (const [panelPosition, panel] of split.panels.entries()) {
      await client.query(
        "INSERT INTO app_project_panels(workspace_key,project_id,panel_id,panel_data,position) VALUES($1,$2,$3,$4::jsonb,$5)",
        [workspaceKey, projectId, String(panel.id), JSON.stringify(panel), panelPosition],
      );
    }
    for (const image of split.images) {
      await client.query(
        "INSERT INTO app_project_images(workspace_key,project_id,image_id,mime_type,image_data) VALUES($1,$2,$3,$4,$5)",
        [workspaceKey, projectId, image.id, image.mimeType, image.data],
      );
    }
  }
}

export async function migrateLegacyWorkspace(client, workspaceKey) {
  const database = typeof client.connect === "function" ? await client.connect() : client;
  await database.query("BEGIN");
  try {
    await database.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`workspace-migration:${workspaceKey}`]);
    const migration = await database.query(
      "SELECT 1 FROM app_workspace_migrations WHERE workspace_key=$1 AND migration_key='projects-panels-images-v1'",
      [workspaceKey],
    );
    if (migration.rowCount) {
      await database.query("COMMIT");
      return;
    }
    const result = await database.query("SELECT payload FROM app_state WHERE workspace_key=$1 FOR UPDATE", [
      workspaceKey,
    ]);
    const payload = result.rows[0]?.payload;
    if (Array.isArray(payload?.projects)) {
      await saveWorkspaceProjects(database, workspaceKey, payload.projects);
      await database.query("UPDATE app_state SET payload=payload-'projects' WHERE workspace_key=$1", [workspaceKey]);
    }
    await database.query(
      "INSERT INTO app_workspace_migrations(workspace_key,migration_key) VALUES($1,'projects-panels-images-v1') ON CONFLICT DO NOTHING",
      [workspaceKey],
    );
    await database.query("COMMIT");
  } catch (error) {
    await database.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    if (database !== client) database.release();
  }
}
