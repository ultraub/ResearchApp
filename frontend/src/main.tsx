import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import App from "./App";
import { initializeAuth } from "@/stores/auth";
import "./index.css";

// Initialize auth state on app load
initializeAuth();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0, // Always fetch fresh - prevents stale data confusion during setup/collaboration
      retry: 1,
      refetchOnWindowFocus: true, // Refetch when user returns to app
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 2000,
            style: {
              background: "#1f2937",
              color: "#f9fafb",
            },
            success: {
              duration: 1500,
              iconTheme: {
                primary: "#22c55e",
                secondary: "#f9fafb",
              },
            },
            error: {
              duration: 4000,
              iconTheme: {
                primary: "#ef4444",
                secondary: "#f9fafb",
              },
            },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
