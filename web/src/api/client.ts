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
  private baseUrl: string = "";

  constructor() {
    this.token = localStorage.getItem("curie_token");
    this.baseUrl = localStorage.getItem("curie_server_url") || "";
  }

  public setBaseUrl(url: string) {
    const cleanUrl = url.trim().replace(/\/+$/, "");
    this.baseUrl = cleanUrl;
    if (cleanUrl) {
      localStorage.setItem("curie_server_url", cleanUrl);
    } else {
      localStorage.removeItem("curie_server_url");
    }
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public resolveUrl(path: string): string {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return path;
    }
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return this.baseUrl ? `${this.baseUrl}${cleanPath}` : cleanPath;
  }

  public async testConnection(url?: string): Promise<{ success: boolean; message?: string }> {
    const targetUrl = url !== undefined ? url.trim().replace(/\/+$/, "") : this.baseUrl;
    const testEndpoint = targetUrl ? `${targetUrl}/health` : "/health";
    try {
      const res = await fetch(testEndpoint);
      if (!res.ok) {
        return { success: false, message: `Server returned HTTP ${res.status}` };
      }
      const data = await res.json();
      if (data?.status === "ok") {
        return { success: true };
      }
      return { success: false, message: "Invalid response from Curie server" };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to reach server" };
    }
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

    const fullUrl = this.resolveUrl(endpoint);
    const res = await fetch(fullUrl, {
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
  public getDownloadUrl(vaultId: string, path: string): string {
    return this.resolveUrl(`/vaults/${vaultId}/content?path=${encodeURIComponent(path)}`);
  }

  public async getFileContent(
    vaultId: string,
    path: string
  ): Promise<{ content: string; hash: string }> {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers["authorization"] = `Bearer ${this.token}`;
    }

    const res = await fetch(this.getDownloadUrl(vaultId, path), { headers });

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

    const res = await fetch(this.getDownloadUrl(vaultId, path), { headers });

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
    const url = this.resolveUrl(
      `/vaults/${vaultId}/content?path=${encodeURIComponent(path)}${
        isConflict ? "&conflict=true" : ""
      }`
    );
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

  public async uploadBinary(
    vaultId: string,
    path: string,
    data: Blob | ArrayBuffer | Uint8Array,
    contentType: string = "application/octet-stream"
  ): Promise<{ success: boolean; hash: string }> {
    const url = this.resolveUrl(
      `/vaults/${vaultId}/content?path=${encodeURIComponent(path)}`
    );
    const headers: Record<string, string> = {
      "content-type": contentType,
    };
    if (this.token) {
      headers["authorization"] = `Bearer ${this.token}`;
    }

    const res = await fetch(url, {
      method: "PUT",
      headers,
      body: data as any,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to upload file: ${res.statusText}`);
    }

    const resData = await res.json();
    return { success: true, hash: resData.hash };
  }

  public async deleteFile(vaultId: string, path: string): Promise<void> {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers["authorization"] = `Bearer ${this.token}`;
    }

    const url = this.resolveUrl(`/vaults/${vaultId}/content?path=${encodeURIComponent(path)}`);
    await fetch(url, {
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

  // Local LLM
  public getLlmEndpoint(): string {
    return localStorage.getItem("curie_llm_endpoint") || "";
  }

  public setLlmEndpoint(endpoint: string) {
    const clean = endpoint.trim().replace(/\/+$/, "");
    if (clean) {
      localStorage.setItem("curie_llm_endpoint", clean);
    } else {
      localStorage.removeItem("curie_llm_endpoint");
    }
  }

  public getLlmModel(): string {
    return localStorage.getItem("curie_llm_model") || "llama3";
  }

  public setLlmModel(model: string) {
    localStorage.setItem("curie_llm_model", model.trim() || "llama3");
  }

  public async queryLlm(
    prompt: string,
    context?: string,
    history: Array<{ role: "user" | "assistant" | "system"; content: string }> = []
  ): Promise<string> {
    let endpoint = this.getLlmEndpoint();
    if (!endpoint) {
      endpoint = this.baseUrl ? `${this.baseUrl}/ai/chat` : "http://localhost:11434/api/chat";
    }

    const model = this.getLlmModel();
    const systemPrompt = context
      ? `You are Curie AI, a helpful study assistant. Use the following note context to answer user questions:\n\n---\n${context}\n---`
      : "You are Curie AI, a helpful study assistant for notes and lectures.";

    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: prompt },
    ];

    const isOllama = endpoint.includes("11434") || endpoint.endsWith("/api/chat");
    const body = isOllama
      ? { model, messages, stream: false }
      : { model, messages };

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.token && endpoint.startsWith(this.baseUrl)) {
      headers["authorization"] = `Bearer ${this.token}`;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`LLM Error (HTTP ${res.status}): ${err || res.statusText}`);
    }

    const data = await res.json();
    if (data?.message?.content) {
      // Ollama format
      return data.message.content;
    }
    if (data?.choices?.[0]?.message?.content) {
      // OpenAI format
      return data.choices[0].message.content;
    }
    if (data?.response) {
      return data.response;
    }
    return JSON.stringify(data);
  }
}

export const api = new ApiClient();
