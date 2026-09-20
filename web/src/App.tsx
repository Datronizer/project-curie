import { useState } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import LoginView from "./views/LoginView";
import NotesView from "./views/NotesView";
import AdminView from "./views/AdminView";
import TopNav from "./components/TopNav";
import { Loader2 } from "lucide-react";

function MainLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<"notes" | "admin">("notes");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
        <span className="text-sm">Connecting to Curie Server...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden h-screen">
      <TopNav currentView={currentView} onViewChange={setCurrentView} />

      <main className="flex-1 flex overflow-hidden">
        {currentView === "notes" ? <NotesView /> : <AdminView />}
      </main>
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
