import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface AppShellContextType {
  title: string;
  setTitle: (title: string) => void;
  action: ReactNode;
  setAction: (action: ReactNode) => void;
  contextBar: ReactNode;
  setContextBar: (contextBar: ReactNode) => void;
}

const AppShellContext = createContext<AppShellContextType | undefined>(undefined);

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState("Zman");
  const [action, setAction] = useState<ReactNode>(null);
  const [contextBar, setContextBar] = useState<ReactNode>(null);

  return (
    <AppShellContext.Provider
      value={{ title, setTitle, action, setAction, contextBar, setContextBar }}
    >
      {children}
    </AppShellContext.Provider>
  );
}

export function useAppShell() {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error("useAppShell must be used within an AppShellProvider");
  }
  return context;
}

interface AppShellHeaderProps {
  title: string;
  /** One primary/header-level action. Complex toolbars belong in context. */
  action?: ReactNode;
  /** Page context controls rendered in a consistent row below the title bar. */
  context?: ReactNode;
}

export function AppShellHeader({ title, action, context }: AppShellHeaderProps) {
  const { setTitle, setAction, setContextBar } = useAppShell();

  useEffect(() => {
    setTitle(title);
  }, [title, setTitle]);

  // نحدّث الـ action عند كل تغيير دون cleanup وسطي (setAction(null))
  // لأن الـ action كائن JSX جديد في كل رندر، فأي cleanup وسطي يُومض الهيدر.
  useEffect(() => {
    setAction(action || null);
  }, [action, setAction]);

  useEffect(() => {
    setContextBar(context || null);
  }, [context, setContextBar]);

  // تنظيف الرأس وشريط السياق عند مغادرة الصفحة.
  useEffect(() => {
    return () => {
      setAction(null);
      setContextBar(null);
    };
  }, [setAction, setContextBar]);

  return null;
}
