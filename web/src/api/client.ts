export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Device {
  id: string;
  name: string;
  token?: string;
  lastSeenAt?: string;
  createdAt?: string;
}

export interface Vault {
  id: string;
  name: string;
}

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  updatedAt?: string;
  children?: TreeNode[];
}

export interface LoginResponse {
  user: User;
  device: {
    id: string;
    name: string;
    token: string;
  };
  vaults: Vault[];
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem("curie_token");
  }

  public setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem("curie_token", token);
    } else {
      localStorage.removeItem("curie_token");
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (this.token && !headers["authorization"]) {
      headers["authorization"] = `Bearer ${this.token}`;
    }

    const res = await fetch(endpoint, {
      ...options,
      headers,
    });

    if (!res.ok) {
      let errorMessage = `HTTP ${res.status} ${res.statusText}`;
      try {
        const data = await res.json();
        if (data?.error?.message) {
          errorMessage = data.error.message;
        }
      } catch {
        // Not JSON
      }
      throw new Error(errorMessage);
    }

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return res.json() as Promise<T>;
    }
    return res.text() as unknown as Promise<T>;
  }

  // Auth
  public async login(
    email: string,
    password: string,
    deviceName?: string
  ): Promise<LoginResponse> {
    const defaultName = `Web Browser (${navigator.platform || "Desktop"})`;
    const data = await this.request<LoginResponse>("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        deviceName: deviceName || defaultName,
      }),
    });
    this.setToken(data.device.token);
    return data;
  }

  // Vaults
  public async listVaults(): Promise<Vault[]> {
    return this.request<Vault[]>("/vaults");
  }

  public async createVault(name: string): Promise<Vault> {
    return this.request<Vault>("/vaults", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }

  public async getVaultTree(vaultId: string): Promise<TreeNode[]> {
    return this.request<TreeNode[]>(`/vaults/${vaultId}/tree`);
  }

  // Content
  public async getFileContent(
    vaultId: string,
    path: string
  ): Promise<{ content: string; hash: string }> {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers["authorization"] = `Bearer ${this.token}`;
    }

    const res = await fetch(
      `/vaults/${vaultId}/content?path=${encodeURIComponent(path)}`,
      { headers }
    );

    if (!res.ok) {
      throw new Error(`Failed to load file: ${res.statusText}`);
    }

    const hash = res.headers.get("x-curie-hash") || "";
    const content = await res.text();
    return { content, hash };
  }

  public async getBlob(vaultId: string, path: string): Promise<Blob> {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers["authorization"] = `Bearer ${this.token}`;
    }

    const res = await fetch(
      `/vaults/${vaultId}/content?path=${encodeURIComponent(path)}`,
      { headers }
    );

    if (!res.ok) {
      throw new Error(`Failed to load file blob: ${res.statusText}`);
    }

    return res.blob();
  }

  public async saveFileContent(
    vaultId: string,
    path: string,
    content: string,
    isConflict?: boolean
  ): Promise<{ success: boolean; hash: string }> {
    const url = `/vaults/${vaultId}/content?path=${encodeURIComponent(path)}${
      isConflict ? "&conflict=true" : ""
    }`;
    const headers: Record<string, string> = {
      "content-type": "text/markdown",
    };
    if (this.token) {
      headers["authorization"] = `Bearer ${this.token}`;
    }

    const res = await fetch(url, {
      method: "PUT",
      headers,
      body: content,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to save note: ${res.statusText}`);
    }

    const data = await res.json();
    return { success: true, hash: data.hash };
  }

  public async deleteFile(vaultId: string, path: string): Promise<void> {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers["authorization"] = `Bearer ${this.token}`;
    }

    await fetch(`/vaults/${vaultId}/content?path=${encodeURIComponent(path)}`, {
      method: "DELETE",
      headers,
    });
  }

  // Devices
  public async listDevices(): Promise<Device[]> {
    return this.request<Device[]>("/devices");
  }

  public async revokeDevice(deviceId: string): Promise<void> {
    await this.request<{ success: boolean }>(`/devices/${deviceId}`, {
      method: "DELETE",
    });
  }
}

export const api = new ApiClient();
