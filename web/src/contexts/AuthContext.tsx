import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import { api, User, Device, Vault } from "../api/client";

interface AuthContextType {
  user: User | null;
  device: Device | null;
  vaults: Vault[];
  activeVault: Vault | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, deviceName?: string) => Promise<void>;
  logout: () => void;
  setActiveVault: (vault: Vault | null) => void;
  refreshVaults: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem("curie_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [device, setDevice] = useState<Device | null>(() => {
    const raw = localStorage.getItem("curie_device");
    return raw ? JSON.parse(raw) : null;
  });
  const [vaults, setVaults] = useState<Vault[]>(() => {
    const raw = localStorage.getItem("curie_vaults");
    return raw ? JSON.parse(raw) : [];
  });
  const [activeVault, setActiveVaultState] = useState<Vault | null>(() => {
    const raw = localStorage.getItem("curie_active_vault");
    return raw ? JSON.parse(raw) : null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const setActiveVault = useCallback((vault: Vault | null) => {
    setActiveVaultState(vault);
    if (vault) {
      localStorage.setItem("curie_active_vault", JSON.stringify(vault));
    } else {
      localStorage.removeItem("curie_active_vault");
    }
  }, []);

  const refreshVaults = useCallback(async () => {
    if (!api.getToken()) return;
    try {
      const list = await api.listVaults();
      setVaults(list);
      localStorage.setItem("curie_vaults", JSON.stringify(list));
      setActiveVaultState((prev) => {
        if (prev && list.some((v) => v.id === prev.id)) {
          return prev;
        }
        const next = list.length > 0 ? list[0] : null;
        if (next) {
          localStorage.setItem("curie_active_vault", JSON.stringify(next));
        } else {
          localStorage.removeItem("curie_active_vault");
        }
        return next;
      });
    } catch (err) {
      console.error("Failed to refresh vaults:", err);
    }
  }, []);

  useEffect(() => {
    const token = api.getToken();
    if (token) {
      refreshVaults().finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [refreshVaults]);

  const login = async (
    email: string,
    password: string,
    deviceName?: string
  ) => {
    const res = await api.login(email, password, deviceName);
    setUser(res.user);
    setDevice(res.device);
    setVaults(res.vaults);

    localStorage.setItem("curie_user", JSON.stringify(res.user));
    localStorage.setItem("curie_device", JSON.stringify(res.device));
    localStorage.setItem("curie_vaults", JSON.stringify(res.vaults));

    const defaultVault = res.vaults.length > 0 ? res.vaults[0] : null;
    setActiveVault(defaultVault);
  };

  const logout = () => {
    api.setToken(null);
    setUser(null);
    setDevice(null);
    setVaults([]);
    setActiveVault(null);
    localStorage.removeItem("curie_user");
    localStorage.removeItem("curie_device");
    localStorage.removeItem("curie_vaults");
    localStorage.removeItem("curie_active_vault");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        device,
        vaults,
        activeVault,
        isAuthenticated: !!user && !!api.getToken(),
        isLoading,
        login,
        logout,
        setActiveVault,
        refreshVaults,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
