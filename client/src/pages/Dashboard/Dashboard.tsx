import React from "react";
import { useNavigate } from "react-router-dom";
import { ConnectionForm } from "@/components/ConnectionForm";
import { Layers } from "lucide-react";

export const Dashboard = () => {
  const navigate = useNavigate();

  const handleConnected = () => {
    // Optionally wait a second or immediately navigate to schema
    setTimeout(() => {
      navigate("/schema");
    }, 1000);
  };

  return (
    <div className="py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <Layers className="h-16 w-16 text-indigo-600 mx-auto mb-4" />
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl">
            Liquibase Migration Tool
          </h1>
          <p className="mt-4 max-w-2xl text-xl text-gray-500 mx-auto">
            Visually explore your PostgreSQL schema, propose changes safely, and
            automatically generate Liquibase XML changesets.
          </p>
        </div>

        <div className="mt-10">
          <ConnectionForm onConnected={handleConnected} />
        </div>
      </div>
    </div>
  );
};
