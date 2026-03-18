// Route-level pages for the application
// This file serves as an index; individual pages should be in separate files

// Page exports structure (to be implemented):
//
// Dashboard.tsx - Main entry point with connection status
// SchemaPage.tsx - Browse schema, propose changes
// ChangesPage.tsx - View and manage proposed changes
// PreviewPage.tsx - Preview generated Liquibase changeset and SQL
//
// Each page should:
// - Use custom hooks from @hooks/index for state management
// - Call APIs through @api/index functions
// - Compose components from @components/ directory
// - Follow routing patterns (to be defined in App.tsx)
//
// Next step: Create individual page files and set up React Router
