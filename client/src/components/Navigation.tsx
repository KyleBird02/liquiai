import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Database,
  LayoutTemplate,
  Layers,
  GitCommit,
  FileJson,
} from "lucide-react";

export const Navigation: React.FC = () => {
  const location = useLocation();

  const navItems = [
    { name: "Schema", path: "/schema", icon: LayoutTemplate },
    { name: "Changes", path: "/changes", icon: GitCommit },
    { name: "Generate Liquibase", path: "/liquibase/setup", icon: FileJson },
  ];

  return (
    <header className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Layers className="h-8 w-8 text-indigo-600 mr-2" />
              <span className="text-xl font-bold text-gray-900">LiquiAI</span>
            </div>
            <nav className="ml-6 flex items-center space-x-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname.startsWith(
                  item.path === "/liquibase/setup" ? "/liquibase" : item.path,
                );
                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    className={`px-3 py-2 rounded-md text-sm font-medium flex items-center ${
                      isActive
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
};
