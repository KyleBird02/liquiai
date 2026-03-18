import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Navigation } from "./components/Navigation";
import { SchemaPage } from "./pages/SchemaPage";
import { ChangesPage } from "./pages/ChangesPage";
import "./index.css";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/schema" element={<SchemaPage />} />
            <Route path="/changes" element={<ChangesPage />} />
            <Route path="/" element={<Navigate to="/schema" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
