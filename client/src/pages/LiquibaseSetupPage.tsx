import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { liquibaseAPI, githubAPI, schemaAPI } from "@/api";

const LiquibaseSetupPage: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    author: "",
    targetApplication: "",
    targetSprint: "",
    branchName: "",
  });
  const [applications, setApplications] = useState<string[]>([]);
  const [sprints, setSprints] = useState<string[]>([]);
  const [appDropdownOpen, setAppDropdownOpen] = useState(false);
  const [sprintDropdownOpen, setSprintDropdownOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      // First try to load existing Phase 2 session so we don't lose data
      try {
        const session = await liquibaseAPI.getSession();
        if (session && session.author) {
          setFormData({
            author: session.author || "",
            targetApplication: session.targetApplication || "",
            targetSprint: session.targetSprint || "",
            branchName: (session.branchName || "").replace(/^OCDEV-/, ""),
          });
          return;
        }
      } catch (err) {
        // Fall back to schema API config if no session
      }

      const cfg = await schemaAPI.getConfig();
      if (cfg && cfg.author) {
        setFormData((prev) => ({ ...prev, author: cfg.author }));
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    const fetchApps = async () => {
      const apps = await githubAPI.getApplications();
      if (apps && Array.isArray(apps)) {
        setApplications(apps);
      }
    };
    fetchApps();
  }, []);

  useEffect(() => {
    if (!formData.targetApplication) {
      setSprints([]);
      return;
    }
    const fetchSprints = async () => {
      const sp = await githubAPI.getSprints(formData.targetApplication);
      if (sp && Array.isArray(sp)) {
        setSprints(sp);
      }
    };
    fetchSprints();
  }, [formData.targetApplication]);

  const filteredApps = applications.filter((a) =>
    a.toLowerCase().includes(formData.targetApplication.toLowerCase()),
  );
  const filteredSprints = sprints.filter((s) =>
    s.toLowerCase().includes(formData.targetSprint.toLowerCase()),
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const fullBranchName = `OCDEV-${formData.branchName}`;
      const result = await liquibaseAPI.initSession(
        formData.author,
        formData.targetApplication,
        formData.targetSprint,
        fullBranchName,
      );

      if (result.error) {
        setError(result.error);
        return;
      }

      navigate("/liquibase/changesets");
    } catch (err) {
      setError("Failed to initialize session");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Liquibase Changeset Generator
        </h1>
        <p className="text-gray-600 mb-8">
          Phase 2: Configure for GitHub PR Generation
        </p>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="author"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              GitHub Author / Username
            </label>
            <input
              id="author"
              name="author"
              type="text"
              value={formData.author}
              onChange={handleChange}
              placeholder="e.g., kyle"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Used as changeset author in Liquibase
            </p>
          </div>

          <div className="relative">
            <label
              htmlFor="targetApplication"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Target Application
            </label>
            <input
              id="targetApplication"
              autoComplete="off"
              name="targetApplication"
              type="text"
              value={formData.targetApplication}
              onChange={handleChange}
              onFocus={() => setAppDropdownOpen(true)}
              onBlur={() => setTimeout(() => setAppDropdownOpen(false), 200)}
              placeholder="e.g., trade-service"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
            {appDropdownOpen && filteredApps.length > 0 && (
              <ul className="absolute z-10 w-full mt-1 bg-white shadow-lg max-h-60 rounded-md py-1 text-base overflow-auto border border-gray-200">
                {filteredApps.map((app) => (
                  <li
                    key={app}
                    className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-blue-100/50"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setFormData((prev) => ({
                        ...prev,
                        targetApplication: app,
                      }));
                      setAppDropdownOpen(false);
                    }}
                  >
                    {app}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Type or select application from GitHub repo
            </p>
          </div>

          <div className="relative">
            <label
              htmlFor="targetSprint"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Target Sprint Folder
            </label>
            <input
              id="targetSprint"
              autoComplete="off"
              name="targetSprint"
              type="text"
              value={formData.targetSprint}
              onChange={handleChange}
              onFocus={() => setSprintDropdownOpen(true)}
              onBlur={() => setTimeout(() => setSprintDropdownOpen(false), 200)}
              placeholder="e.g., sprint-42"
              required
              disabled={!formData.targetApplication}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
            />
            {sprintDropdownOpen && filteredSprints.length > 0 && (
              <ul className="absolute z-10 w-full mt-1 bg-white shadow-lg max-h-60 rounded-md py-1 text-base overflow-auto border border-gray-200">
                {filteredSprints.map((sprint) => (
                  <li
                    key={sprint}
                    className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-blue-100/50"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setFormData((prev) => ({
                        ...prev,
                        targetSprint: sprint,
                      }));
                      setSprintDropdownOpen(false);
                    }}
                  >
                    {sprint}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-gray-500">
              {formData.targetApplication
                ? "Type or select a sprint folder"
                : "Select an application first"}
            </p>
          </div>

          <div>
            <label
              htmlFor="branchName"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Branch Name
            </label>
            <div className="flex shadow-sm rounded-md border border-gray-300 focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500">
              <span className="inline-flex items-center px-3 rounded-l-md border-r border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                OCDEV-
              </span>
              <input
                id="branchName"
                name="branchName"
                type="text"
                value={formData.branchName}
                onChange={handleChange}
                placeholder="admin-feature"
                required
                className="flex-1 block w-full px-3 py-2 rounded-r-md border-transparent focus:border-transparent focus:ring-0 sm:text-sm"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Your PR will be created from this branch. E.g. OCDEV-
              {formData.branchName || "admin-feature"}
            </p>
          </div>

          <button
            type="submit"
            disabled={
              loading ||
              !formData.author ||
              !formData.targetApplication ||
              !formData.targetSprint ||
              !formData.branchName
            }
            className="w-full justify-center flex bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 font-medium transition-colors"
          >
            {loading ? "Initializing..." : "Continue to Changesets"}
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-gray-200">
          <p className="text-xs text-gray-600 leading-relaxed">
            <strong>Before proceeding:</strong> Ensure you have created proposed
            changes in Phase 1 (Create Table, Alter Table, etc.). You'll be
            asked to select them in the next step.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LiquibaseSetupPage;
