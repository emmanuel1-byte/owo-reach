import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { ToastProvider } from "./lib/toast.jsx";
import { LiveEventsProvider } from "./lib/liveEvents.jsx";


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

import SignIn from "./pages/SignIn.jsx";
import SignUp from "./pages/SignUp.jsx";
import Home from "./pages/Home.jsx";
import Review from "./pages/Review.jsx";
import Batch from "./pages/Batch.jsx";
import Audit from "./pages/Audit.jsx";
import Transactions from "./pages/Transactions.jsx";
import Ledger from "./pages/Ledger.jsx";
import Settings from "./pages/Settings.jsx";
import NotFound from "./pages/NotFound.jsx";

const router = createHashRouter([
  { path: "/", element: <SignIn /> },
  { path: "/signup", element: <SignUp /> },
  { path: "/home", element: <Home /> },
  { path: "/review", element: <Review /> },
  { path: "/review/:runId", element: <Review /> },
  { path: "/batch", element: <Batch /> },
  { path: "/batch/:runId", element: <Batch /> },
  { path: "/audit/:runId", element: <Audit /> },
  { path: "/transactions", element: <Transactions /> },
  { path: "/ledger", element: <Ledger /> },
  { path: "/settings", element: <Settings /> },
  // Catch-all: without this an unknown hash route renders a blank page.
  { path: "*", element: <NotFound /> },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {/* Above the router so a single EventSource serves every screen, and
            navigating between them doesn't tear the connection down. */}
        <LiveEventsProvider>
          <RouterProvider router={router} />
        </LiveEventsProvider>
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>
);