import AppShell from "../components/AppShell.jsx";
import ErrorState from "../components/ErrorState.jsx";

/**
 * Catch-all for URLs the router doesn't know. Rendered inside the app shell so
 * a mistyped link still leaves the sidebar and balance strip in reach — a dead
 * end shouldn't also strand you.
 */
export default function NotFound() {
  return (
    <AppShell active="home">
      <ErrorState
        code="404"
        title="This page doesn't exist"
        description="The link may be out of date, or the run it pointed to has been removed. Everything you can reach is in the sidebar."
      />
    </AppShell>
  );
}
