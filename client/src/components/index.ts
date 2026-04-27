// Reusable UI components for the application
// This file serves as an index; individual components should be in separate files

// Component exports structure (to be implemented):
//
// ConnectionForm.tsx - Input form for database connection string
// SchemaViewer.tsx - Display tables, columns, relationships
// TableCreator.tsx - Form to create new table with columns
// TableAlter.tsx - Form to alter existing table
// DiffViewer.tsx - Visual before/after schema comparison

export { ConnectionForm } from "./ConnectionForm";
export { Navigation } from "./Navigation";
export {
  SchemaViewer,
  CreateTableModal,
  ColumnDetailsTab,
  AddColumnModal,
  AIAssistantModal,
} from "./schemaPage";
export { AlertModal } from "./AlertModal";

// Grid Config components
export { GridEditor } from "./gridConfigPage";
export { GridColumnList } from "./gridConfigPage";
export { GridPreview } from "./gridConfigPage";
export { AIAssistantPanel } from "./gridConfigPage";

// Changes page components
export { ChangeItemActions, PayloadRenderer } from "./changesPage";

// Changeset review components
export {
  SelectionStep,
  ReviewStep,
  ChangesetCard,
} from "./changesetReviewPage";

// ValidationPanel.tsx - Show validation errors/warnings from changes
// ChangesetViewer.tsx - Display generated Liquibase XML changeset
// ChangesList.tsx - List all proposed changes in session
// ColumnInput.tsx - Reusable column definition input component
// ForeignKeyInput.tsx - Reusable FK constraint input component
//
// These components should be built following:
// - Functional React components with hooks
// - Tailwind CSS styling
// - Proper TypeScript types from @types/index
// - Proper separation of concerns
//
// Next step: Create individual component files as needed for Phase 1
