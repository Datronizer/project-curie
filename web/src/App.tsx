import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import LoginView from "./views/LoginView";
import NotesView from "./views/NotesView";
import AdminView from "./views/AdminView";
import TopNav from "./components/TopNav";
import ShareImportModal from "./components/ShareImportModal";
import LlmChatDrawer from "./components/LlmChatDrawer";
import { checkSharedFiles, SharedFile } from "./services/shareReceiver";
import { LuLoaderCircle } from "react-icons/lu";

function MainLayout() {
  const { isAuthenticated, isLoading, refreshVaults } = useAuth();
  const [currentView, setCurrentView] = useState<"notes" | "admin">("notes");
  const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showAiChat, setShowAiChat] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    const checkShare = async () => {
      const files = await checkSharedFiles();
      if (files.length > 0) {
        setSharedFiles(files);
        setShowShareModal(true);
      }
    };

    checkShare();

    const handleFocus = () => {
      checkShare();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <LuLoaderCircle className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
        <span className="text-sm">Connecting to Curie Server...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden h-screen">
      <TopNav
        currentView={currentView}
        onViewChange={setCurrentView}
        onToggleAiChat={() => setShowAiChat(!showAiChat)}
        isAiChatOpen={showAiChat}
      />

      <main className="flex-1 flex overflow-hidden">
        {currentView === "notes" ? <NotesView /> : <AdminView />}
      </main>

      <ShareImportModal
        files={sharedFiles}
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        onImportComplete={() => {
          refreshVaults();
        }}
      />

      <LlmChatDrawer
        isOpen={showAiChat}
        onClose={() => setShowAiChat(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
}
