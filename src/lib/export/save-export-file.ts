export function canUseNativeSavePicker(): boolean {
  return (
    typeof window !== "undefined" &&
    "showSaveFilePicker" in window &&
    typeof (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker ===
      "function"
  );
}

export type SavePickerResult = "saved" | "aborted" | "unavailable";

export async function saveBlobWithNativePicker(
  blob: Blob,
  filename: string,
  description: string,
  accept: Record<string, string[]>,
): Promise<SavePickerResult> {
  if (!canUseNativeSavePicker()) {
    return "unavailable";
  }

  const showSaveFilePicker = (
    window as unknown as {
      showSaveFilePicker: (options: {
        suggestedName: string;
        types: Array<{
          description: string;
          accept: Record<string, string[]>;
        }>;
      }) => Promise<FileSystemFileHandle>;
    }
  ).showSaveFilePicker;

  try {
    const handle = await showSaveFilePicker({
      suggestedName: filename,
      types: [{ description, accept }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return "saved";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return "aborted";
    }
    return "unavailable";
  }
}
