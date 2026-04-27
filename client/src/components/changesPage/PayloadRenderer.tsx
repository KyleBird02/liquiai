import React from "react";

interface PayloadRendererProps {
  type: string;
  payload: any;
}

export const PayloadRenderer: React.FC<PayloadRendererProps> = ({
  type,
  payload,
}) => {
  if (type === "CREATE_TABLE") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-gray-800">
            New Table:{" "}
            <span className="font-mono text-indigo-600">
              {payload.schema ? `${payload.schema}.` : ""}
              {payload.tableName}
            </span>
          </span>
        </div>
        {payload.columns && payload.columns.length > 0 && (
          <div>
            <h5 className="text-sm font-medium text-gray-600 mb-2 uppercase tracking-wider">
              Columns
            </h5>
            <ul className="space-y-1 bg-white border border-gray-200 rounded-md overflow-hidden">
              {payload.columns.map((col: any, idx: number) => (
                <li
                  key={idx}
                  className="px-4 py-2 flex items-center gap-2 border-b last:border-0 hover:bg-gray-50"
                >
                  <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold text-xs">
                    +
                  </span>
                  <span className="text-emerald-800 font-mono text-sm">
                    {col.name}
                  </span>
                  <span className="text-gray-500 text-xs">
                    ({col.type}
                    {col.nullable ? ", nullable" : ", not null"}
                    {col.defaultValue ? `, default: ${col.defaultValue}` : ""}
                    {col.isPrimaryKey ? ", primary key" : ""})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {payload.foreignKeys && payload.foreignKeys.length > 0 && (
          <div>
            <h5 className="text-sm font-medium text-gray-600 mb-2 uppercase tracking-wider">
              Foreign Keys
            </h5>
            <ul className="space-y-1 bg-white border border-gray-200 rounded-md overflow-hidden">
              {payload.foreignKeys.map((fk: any, idx: number) => (
                <li
                  key={idx}
                  className="px-4 py-2 flex items-center gap-2 border-b last:border-0 hover:bg-gray-50"
                >
                  <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold text-xs">
                    +
                  </span>
                  <span className="text-emerald-800 font-mono text-sm">
                    {fk.column}
                  </span>
                  <span className="text-gray-500 text-xs">
                    (references {fk.referencedTable}.{fk.referencedColumn}
                    {fk.onDelete ? ` ON DELETE ${fk.onDelete}` : ""})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (type === "ALTER_TABLE") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-gray-800">
            Alter Table:{" "}
            <span className="font-mono text-indigo-600">
              {payload.schema ? `${payload.schema}.` : ""}
              {payload.tableName}
            </span>
          </span>
        </div>

        {(payload.addedColumns?.length > 0 ||
          payload.removedColumns?.length > 0 ||
          payload.modifiedColumns?.length > 0) && (
          <div>
            <h5 className="text-sm font-medium text-gray-600 mb-2 uppercase tracking-wider">
              Column Changes
            </h5>
            <ul className="space-y-1 bg-white border border-gray-200 rounded-md overflow-hidden">
              {payload.addedColumns?.map((col: any, idx: number) => (
                <li
                  key={`add-${idx}`}
                  className="px-4 py-2 flex items-center gap-2 border-b last:border-0 hover:bg-gray-50"
                >
                  <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold text-xs">
                    +
                  </span>
                  <span className="text-emerald-800 font-mono text-sm">
                    {col.name}
                  </span>
                  <span className="text-gray-500 text-xs">
                    ({col.type}
                    {col.nullable ? ", nullable" : ", not null"}
                    {col.defaultValue ? `, default: ${col.defaultValue}` : ""})
                  </span>
                </li>
              ))}

              {payload.removedColumns?.map((col: any, idx: number) => (
                <li
                  key={`rm-${idx}`}
                  className="px-4 py-2 flex items-center gap-2 border-b last:border-0 hover:bg-gray-50"
                >
                  <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold text-xs">
                    -
                  </span>
                  <span className="text-red-800 font-mono text-sm">
                    {typeof col === "string" ? col : col.name}
                  </span>
                  <span className="text-gray-500 text-xs">(dropped)</span>
                </li>
              ))}

              {payload.modifiedColumns?.map((mod: any, idx: number) => {
                const col = mod.newDefinition;
                const oldcol = mod.oldDefinition;

                const changes = [];
                if (col.name !== oldcol.name) {
                  changes.push(`renamed from ${oldcol.name}`);
                }
                if (col.type !== oldcol.type) {
                  changes.push(`${oldcol.type} → ${col.type}`);
                }
                if (col.nullable !== oldcol.nullable) {
                  changes.push(
                    col.nullable ? "made nullable" : "made not null",
                  );
                }
                if (col.defaultValue !== oldcol.defaultValue) {
                  if (!oldcol.defaultValue && col.defaultValue) {
                    changes.push(`added default ${col.defaultValue}`);
                  } else if (oldcol.defaultValue && !col.defaultValue) {
                    changes.push(`dropped default ${oldcol.defaultValue}`);
                  } else {
                    changes.push(
                      `default ${oldcol.defaultValue} → ${col.defaultValue}`,
                    );
                  }
                }

                return (
                  <li
                    key={`mod-${idx}`}
                    className="px-4 py-2 flex items-center gap-2 border-b last:border-0 hover:bg-gray-50"
                  >
                    <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold text-xs">
                      ~
                    </span>
                    <span className="text-blue-800 font-mono text-sm">
                      {col.name}
                    </span>
                    <span className="text-gray-500 text-xs flex gap-1 items-center flex-wrap">
                      {changes.map((changeStr, cIdx) => (
                        <React.Fragment key={cIdx}>
                          {cIdx > 0 && <span>•</span>}
                          <span className="bg-gray-100 px-1.5 py-0.5 rounded">
                            {changeStr}
                          </span>
                        </React.Fragment>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {(payload.addedForeignKeys?.length > 0 ||
          payload.removedForeignKeys?.length > 0) && (
          <div>
            <h5 className="text-sm font-medium text-gray-600 mb-2 uppercase tracking-wider">
              Foreign Key Changes
            </h5>
            <ul className="space-y-1 bg-white border border-gray-200 rounded-md overflow-hidden">
              {payload.addedForeignKeys?.map((fk: any, idx: number) => (
                <li
                  key={`add-fk-${idx}`}
                  className="px-4 py-2 flex items-center gap-2 border-b last:border-0 hover:bg-gray-50"
                >
                  <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold text-xs">
                    +
                  </span>
                  <span className="text-emerald-800 font-mono text-sm">
                    {fk.column}
                  </span>
                  <span className="text-gray-500 text-xs">
                    (references {fk.referencedTable}.{fk.referencedColumn})
                  </span>
                </li>
              ))}

              {payload.removedForeignKeys?.map((fk: any, idx: number) => (
                <li
                  key={`rm-fk-${idx}`}
                  className="px-4 py-2 flex items-center gap-2 border-b last:border-0 hover:bg-gray-50"
                >
                  <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold text-xs">
                    -
                  </span>
                  <span className="text-red-800 font-mono text-sm">
                    {typeof fk === "string" ? fk : fk.constraintName || fk.name}
                  </span>
                  <span className="text-gray-500 text-xs">(dropped)</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (type === "DROP_TABLE") {
    return (
      <div className="space-y-4">
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-3">
          <span className="bg-red-100 text-red-700 px-2 py-1 rounded font-bold text-sm">
            -
          </span>
          <span className="text-red-800 font-semibold">
            Drop Table:{" "}
            <span className="font-mono">
              {payload.schema ? `${payload.schema}.` : ""}
              {payload.tableName}
            </span>
          </span>
        </div>
      </div>
    );
  }

  if (type === "EXECUTE_SQL") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h5 className="text-sm font-medium text-gray-600 uppercase tracking-wider">
            Raw SQL Statement
          </h5>
        </div>
        <pre className="text-sm bg-gray-900 text-gray-100 p-4 rounded font-mono overflow-x-auto border border-gray-700">
          {payload.sql}
        </pre>
      </div>
    );
  }

  if (type === "GRID_CONFIG") {
    const diff = payload?.diff;
    const added = diff?.addedColumns?.length || 0;
    const removed = diff?.removedColumns?.length || 0;
    const modified = diff?.modifiedAttributes?.length || 0;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-gray-800">
            Grid Bundle:{" "}
            <span className="font-mono text-indigo-600">
              {payload?.gridName}
            </span>
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-sm text-emerald-800">
            Added: {added}
          </div>
          <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-800">
            Removed: {removed}
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded p-2 text-sm text-blue-800">
            Modified: {modified}
          </div>
        </div>

        {Array.isArray(diff?.modifiedAttributes) &&
          diff.modifiedAttributes.length > 0 && (
            <ul className="space-y-1 bg-white border border-gray-200 rounded-md overflow-hidden">
              {diff.modifiedAttributes.map((m: any, idx: number) => (
                <li
                  key={idx}
                  className="px-4 py-2 text-sm border-b last:border-0"
                >
                  <span className="font-mono text-blue-800">
                    {m.columnName}
                  </span>
                  <span className="text-gray-500"> {m.field}: </span>
                  <span className="text-gray-700">
                    {String(m.before)} → {String(m.after)}
                  </span>
                </li>
              ))}
            </ul>
          )}
      </div>
    );
  }

  return (
    <pre className="text-sm bg-gray-50 p-4 rounded text-gray-800 overflow-x-auto">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
};
