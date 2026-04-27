import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Navigation } from "./components/Navigation";
import { AlertProvider } from "./hooks/index";
import {
  SchemaPage,
  ChangesPage,
  LiquibaseSetupPage,
  ChangesetReviewPage,
  FilePreviewPage,
  PRCreationPage,
  GridConfigPage,
} from "./pages";
import "./index.css";

function AppContent() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <Routes>
          {/* Phase 1 - Schema & Changes */}
          <Route path="/schema" element={<SchemaPage />} />
          <Route path="/changes" element={<ChangesPage />} />
          <Route path="/grids" element={<GridConfigPage />} />

          {/* Phase 2 - Liquibase Changeset Generation & PR Creation */}
          <Route path="/liquibase/setup" element={<LiquibaseSetupPage />} />
          <Route
            path="/liquibase/changesets"
            element={<ChangesetReviewPage />}
          />
          <Route path="/liquibase/preview" element={<FilePreviewPage />} />
          <Route path="/liquibase/create-pr" element={<PRCreationPage />} />

          {/* Default route */}
          <Route path="/" element={<Navigate to="/schema" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AlertProvider>
        <AppContent />
      </AlertProvider>
    </BrowserRouter>
  );
}

export default App;
