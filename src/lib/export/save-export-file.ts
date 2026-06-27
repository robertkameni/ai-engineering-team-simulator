type ShowSaveFilePickerFn = (options: {
  suggestedName: string;
  types: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<FileSystemFileHandle>;

export function canUseNativeSavePicker(): boolean {
  return (
    typeof window !== "undefined" &&
    "showSaveFilePicker" in window &&
    typeof (window as unknown as { showSaveFilePicker?: unknown })
      .showSaveFilePicker === "function"
  );
}

function getShowSaveFilePicker(): ShowSaveFilePickerFn {
  return (window as unknown as { showSaveFilePicker: ShowSaveFilePickerFn })
    .showSaveFilePicker;
}

export async function openSavePickerForBlob(
  filename: string,
  description: string,
  accept: Record<string, string[]>,
): Promise<((blob: Blob) => Promise<void>) | null> {
  if (!canUseNativeSavePicker()) return null;

  let handle: FileSystemFileHandle;
  try {
    handle = await getShowSaveFilePicker()({
      suggestedName: filename,
      types: [{ description, accept }],
    });
  } catch {
    return null;
  }

  return async (blob: Blob) => {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  };
}

export type SavePickerResult = "saved" | "aborted" | "unavailable";

async function saveBlobWithNativePicker(
  blob: Blob,
  filename: string,
  description: string,
  accept: Record<string, string[]>,
): Promise<SavePickerResult> {
  const save = await openSavePickerForBlob(filename, description, accept);
  if (save === null) return "unavailable";
  try {
    await save(blob);
    return "saved";
  } catch {
    return "unavailable";
  }
}
