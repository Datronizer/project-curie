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
    const tokenParam = this.token ? `&token=${encodeURIComponent(this.token)}` : "";
    return this.resolveUrl(`/vaults/${vaultId}/content?path=${encodeURIComponent(path)}${tokenParam}`);
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

  // AI Gateway & LLM
  public getAiProvider(): "gemini" | "ollama" {
    return (localStorage.getItem("curie_ai_provider") as any) || "gemini";
  }

  public setAiProvider(provider: "gemini" | "ollama") {
    localStorage.setItem("curie_ai_provider", provider);
  }

  public getAiModel(): string {
    return localStorage.getItem("curie_ai_model") || "gemini-3.8-flash";
  }

  public setAiModel(model: string) {
    localStorage.setItem("curie_ai_model", model.trim() || "gemini-3.8-flash");
  }

  public getAiThinkingEffort(): "off" | "low" | "medium" | "high" {
    return (localStorage.getItem("curie_ai_thinking") as any) || "medium";
  }

  public setAiThinkingEffort(effort: "off" | "low" | "medium" | "high") {
    localStorage.setItem("curie_ai_thinking", effort);
  }

  public async getAiModels(): Promise<Array<{
    id: string;
    name: string;
    description: string;
    supportsThinking: boolean;
    defaultThinkingEffort?: "off" | "low" | "medium" | "high";
    isFlagship?: boolean;
  }>> {
    try {
      const res = await this.request<{ success: boolean; models: any[] }>("/ai/models");
      if (res?.models?.length) return res.models;
    } catch {
      // Fallback if offline
    }
    return [
      {
        id: "gemini-3.8-flash",
        name: "Gemini 3.8 Flash",
        description: "Next-gen flagship: Ultra-low latency, multimodal, native deep thinking.",
        supportsThinking: true,
        defaultThinkingEffort: "medium",
        isFlagship: true,
      },
      {
        id: "gemini-3.8-pro",
        name: "Gemini 3.8 Pro",
        description: "Deep analytical reasoning for advanced mathematics, coding, and multi-step derivations.",
        supportsThinking: true,
        defaultThinkingEffort: "high",
        isFlagship: true,
      },
      {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        description: "Fast multimodal model optimized for notes, lecture summaries, and high throughput.",
        supportsThinking: true,
        defaultThinkingEffort: "low",
      },
      {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        description: "Lightweight, reliable streaming with broad multimodal capabilities.",
        supportsThinking: true,
        defaultThinkingEffort: "low",
      },
      {
        id: "gemini-1.5-pro",
        name: "Gemini 1.5 Pro",
        description: "Massive 2M token context window for full textbooks, PDFs, and multi-semester vaults.",
        supportsThinking: false,
        defaultThinkingEffort: "off",
      },
    ];
  }

  public async streamAiChat(options: {
    vaultId?: string;
    prompt: string;
    model?: string;
    thinkingEffort?: "off" | "low" | "medium" | "high";
    activeNotePath?: string;
    attachmentPaths?: string[];
    history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    onToken: (token: string) => void;
    onThought?: (thought: string) => void;
    onError?: (error: string) => void;
    signal?: AbortSignal;
  }): Promise<void> {
    const url = options.vaultId
      ? this.resolveUrl(`/vaults/${options.vaultId}/ai/chat`)
      : this.resolveUrl("/ai/chat");

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.token) {
      headers["authorization"] = `Bearer ${this.token}`;
    }

    const payload = {
      vaultId: options.vaultId,
      prompt: options.prompt,
      model: options.model || this.getAiModel(),
      thinkingEffort: options.thinkingEffort || this.getAiThinkingEffort(),
      activeNotePath: options.activeNotePath,
      attachmentPaths: options.attachmentPaths,
      history: options.history,
    };

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: options.signal,
    });

    if (!res.ok) {
      let errMsg = `Server returned status ${res.status}`;
      try {
        const data = await res.json();
        if (data?.error?.message) {
          errMsg = data.error.message;
        }
      } catch {
        const text = await res.text().catch(() => "");
        if (text) errMsg = text;
      }
      throw new Error(errMsg);
    }

    if (!res.body) {
      throw new Error("No response stream received from Curie AI server");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;

          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") return;

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.type === "token" && parsed.text) {
              options.onToken(parsed.text);
            } else if (parsed.type === "thought" && parsed.text) {
              options.onThought?.(parsed.text);
            } else if (parsed.type === "error" && parsed.message) {
              options.onError?.(parsed.message);
            }
          } catch {
            // Partial chunk
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // Legacy local LLM backwards compatibility
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
    return this.getAiModel();
  }

  public setLlmModel(model: string) {
    this.setAiModel(model);
  }

  public async queryLlm(
    prompt: string,
    _context?: string,
    history: Array<{ role: "user" | "assistant" | "system"; content: string }> = []
  ): Promise<string> {
    let fullResponse = "";
    await this.streamAiChat({
      prompt: _context ? `Context:\n${_context}\n\nQuestion: ${prompt}` : prompt,
      history,
      onToken: (tok) => {
        fullResponse += tok;
      },
    });
    return fullResponse;
  }
}

export const api = new ApiClient();
