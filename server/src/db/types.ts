import {
    type InferSelectModel,
    type InferInsertModel
} from "drizzle-orm";
import { users } from "./schema/users";
import { vaults } from "./schema/vaults";
import { vaultMembers } from "./schema/vaultMembers";
import { files } from "./schema/files";
import { devices } from "./schema/devices";
import { syncStates } from "./schema/syncStates";
import { ingestionJobs } from "./schema/ingestionJobs";
import { aiConversations } from "./schema/aiConversations";
import { aiMessages } from "./schema/aiMessages";

// Entity types (database rows)
export type User = InferSelectModel<typeof users>;
export type Vault = InferSelectModel<typeof vaults>;
export type VaultMember = InferSelectModel<typeof vaultMembers>;
export type Device = InferSelectModel<typeof devices>;
export type File = InferSelectModel<typeof files>;
export type SyncState = InferSelectModel<typeof syncStates>;
export type IngestionJob = InferSelectModel<typeof ingestionJobs>;
export type AiConversation = InferSelectModel<typeof aiConversations>;
export type AiMessage = InferSelectModel<typeof aiMessages>;

// Insert DTO types (for create() operations)
export type CreateUserDto = InferInsertModel<typeof users>;
export type CreateVaultDto = InferInsertModel<typeof vaults>;
export type CreateVaultMemberDto = InferInsertModel<typeof vaultMembers>;
export type CreateDeviceDto = InferInsertModel<typeof devices>;
export type CreateFileDto = InferInsertModel<typeof files>;
export type CreateSyncStateDto = InferInsertModel<typeof syncStates>;
export type CreateIngestionJobDto = InferInsertModel<typeof ingestionJobs>;
export type CreateAiConversationDto = InferInsertModel<typeof aiConversations>;
export type CreateAiMessageDto = InferInsertModel<typeof aiMessages>;
