import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Navigation } from "./components/Navigation";
import { SchemaPage } from "./pages/SchemaPage";
import { ChangesPage } from "./pages/ChangesPage";
import LiquibaseSetupPage from "./pages/LiquibaseSetupPage";
import ChangesetReviewPage from "./pages/ChangesetReviewPage";
import FilePreviewPage from "./pages/FilePreviewPage";
import PRCreationPage from "./pages/PRCreationPage";
import "./index.css";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Routes>
            {/* Phase 1 - Schema & Changes */}
            <Route path="/schema" element={<SchemaPage />} />
            <Route path="/changes" element={<ChangesPage />} />

            {/* Phase 2 - Liquibase Changeset Generation & PR Creation */}
            <Route path="/phase2/setup" element={<LiquibaseSetupPage />} />
            <Route
              path="/phase2/changesets"
              element={<ChangesetReviewPage />}
            />
            <Route path="/phase2/preview" element={<FilePreviewPage />} />
            <Route path="/phase2/create-pr" element={<PRCreationPage />} />

            {/* Default route */}
            <Route path="/" element={<Navigate to="/schema" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
