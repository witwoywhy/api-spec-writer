import { registerProjectFileHandle, type ProjectFileHandle } from "../adaptors/projectStore";
import type { Project } from "../domain";
import { safeFileName } from "../features/preview/exportActions";

type ProjectFilePicker = {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: Array<{
      description: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<ProjectFileHandle[]>;
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{
      description: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<ProjectFileHandle>;
};

const PROJECT_FILE_TYPE = {
  description: "API Spec Writer project",
  accept: { "application/json": [".json"] },
};

export async function saveProjectFile(project: Project) {
  const picker = window as Window & ProjectFilePicker;
  if (!picker.showSaveFilePicker) {
    window.alert("Your browser does not support choosing a project file location.");
    return "";
  }

  try {
    const fileHandle = await picker.showSaveFilePicker({
      suggestedName: `${safeFileName(project.name)}.json`,
      types: [PROJECT_FILE_TYPE],
    });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(project, null, 2));
    await writable.close();
    await registerProjectFileHandle(project.id, fileHandle);
    return fileHandle.name ?? `${safeFileName(project.name)}.json`;
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "AbortError") return "";
    window.alert("Cannot save project file. The project was not created.");
    return "";
  }
}

export async function selectProjectFile() {
  const picker = window as Window & ProjectFilePicker;
  if (!picker.showOpenFilePicker) {
    window.alert("Your browser does not support opening a project file.");
    return null;
  }

  const [handle] = await picker.showOpenFilePicker({
    multiple: false,
    types: [PROJECT_FILE_TYPE],
  });
  if (!handle) return null;
  return {
    handle,
    file: await handle.getFile(),
  };
}
