import type { Project, StoreDocument } from "../domain";

const PROJECT_DRAFT_STORAGE_PREFIX = "api-spec-writer-platform:project-draft:v1:";

type ProjectDraft = {
  schemaVersion: 1;
  savedAt: string;
  project: Project;
};

const now = () => new Date().toISOString();

export function writeProjectDraft(project: Project) {
  const draft: ProjectDraft = {
    schemaVersion: 1,
    savedAt: now(),
    project,
  };
  localStorage.setItem(projectDraftKey(project.id), JSON.stringify(draft));
}

export function removeProjectDraft(projectId: string) {
  localStorage.removeItem(projectDraftKey(projectId));
}

export function mergeProjectDrafts(store: StoreDocument): StoreDocument {
  return {
    ...store,
    projects: store.projects.map((project) => readProjectDraft(project.id) ?? project),
  };
}

function projectDraftKey(projectId: string) {
  return `${PROJECT_DRAFT_STORAGE_PREFIX}${projectId}`;
}

function readProjectDraft(projectId: string) {
  const raw = localStorage.getItem(projectDraftKey(projectId));
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as ProjectDraft;
    if (draft.schemaVersion !== 1 || draft.project?.id !== projectId) return null;
    return normalizeProjectDraft(draft.project);
  } catch {
    return null;
  }
}

function normalizeProjectDraft(project: Project): Project {
  return {
    ...project,
    db_schema: Array.isArray(project.db_schema) ? project.db_schema : [],
    service_folders: Array.isArray(project.service_folders) ? project.service_folders : [],
  };
}
