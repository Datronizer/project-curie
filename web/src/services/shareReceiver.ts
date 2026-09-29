import { registerPlugin, Capacitor } from "@capacitor/core";

export interface SharedFile {
  name: string;
  size: number;
  mimeType: string;
  path: string;
}

interface ShareReceiverPlugin {
  getSharedFiles(): Promise<{ files: SharedFile[] }>;
  readFile(options: { path: string }): Promise<{ data: string }>;
  clearSharedFiles(): Promise<void>;
}

const ShareReceiver = registerPlugin<ShareReceiverPlugin>("ShareReceiver");

export async function checkSharedFiles(): Promise<SharedFile[]> {
  if (!Capacitor.isNativePlatform()) {
    return [];
  }
  try {
    const res = await ShareReceiver.getSharedFiles();
    return res.files || [];
  } catch (err) {
    console.error("Failed to get shared files from native plugin:", err);
    return [];
  }
}

export async function readSharedFileAsBlob(
  file: SharedFile
): Promise<Blob> {
  const res = await ShareReceiver.readFile({ path: file.path });
  const byteCharacters = atob(res.data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: file.mimeType || "application/octet-stream" });
}

export async function clearSharedFiles(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await ShareReceiver.clearSharedFiles();
  } catch (err) {
    console.error("Failed to clear shared files:", err);
  }
}
