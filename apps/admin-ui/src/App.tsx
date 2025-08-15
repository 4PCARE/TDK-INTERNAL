
import { BrowserRouter } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "./components/ui/toaster";
import { SidebarProvider } from "./components/ui/sidebar";
import Landing from "./pages/Landing";
import "./index.css";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <BrowserRouter>
          <Landing />
          <Toaster />
        </BrowserRouter>
      </SidebarProvider>
    </QueryClientProvider>
  );
}

export default App;
