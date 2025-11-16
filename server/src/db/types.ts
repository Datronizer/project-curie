import {
  type InferSelectModel,
  type InferInsertModel
} from "drizzle-orm";
import { vaults } from "./schema/vaults";
import { files } from "./schema/files";
import { fileVersions } from "./schema/fileVersions";
import { devices } from "./schema/devices";
import { syncStates } from "./schema/syncStates";

// Entity types (database rows)
export type Vault = InferSelectModel<typeof vaults>;
export type File = InferSelectModel<typeof files>;
export type FileVersion = InferSelectModel<typeof fileVersions>;
export type Device = InferSelectModel<typeof devices>;
export type SyncState = InferSelectModel<typeof syncStates>;

// Insert DTO types (for create() operations)
export type CreateVaultDto = InferInsertModel<typeof vaults>;
export type CreateFileDto = InferInsertModel<typeof files>;
export type CreateFileVersionDto = InferInsertModel<typeof fileVersions>;
export type CreateDeviceDto = InferInsertModel<typeof devices>;
export type CreateSyncStateDto = InferInsertModel<typeof syncStates>;
