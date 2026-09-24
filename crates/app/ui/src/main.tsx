import "@/styles/globals.css";
import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { queryClient } from "@/api/queries";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <App />
        {/* Top-right: a bottom toast would sit over a detail pane's sticky Save for the 4-8 s it's up. */}
        <Toaster theme="dark" position="top-right" />
      </TooltipProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
