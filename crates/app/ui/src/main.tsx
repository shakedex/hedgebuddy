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
        {/* Bottom-right (top-right sat over the profile pill, and at 480 px the Back button): the offset
            clears the detail pane's 44 px sticky footer plus a comfortable gap, at both breakpoints. */}
        <Toaster theme="dark" position="bottom-right" offset={{ bottom: "60px" }} mobileOffset={{ bottom: "60px" }} />
      </TooltipProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
