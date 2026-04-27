import React, { useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
} from "reactflow";
import "reactflow/dist/style.css";
import { TableDefinition } from "@/types/index";

interface SchemaViewerProps {
  tables: TableDefinition[];
}

// Custom Node for Tables
const TableNode = ({ data }: { data: { table: TableDefinition } }) => {
  const { table } = data;
  return (
    <div className="bg-white rounded shadow-md border border-gray-200 min-w-[200px]">
      <div className="bg-indigo-600 text-white font-bold px-4 py-2 rounded-t flex justify-between">
        <span>{table.name}</span>
        <span className="text-xs text-indigo-200 ml-2">{table.schema}</span>
      </div>
      <div className="p-2 space-y-1">
        {table.columns.map((col) => (
          <div
            key={col.name}
            className="flex justify-between text-sm py-1 border-b border-gray-100 last:border-0 relative"
          >
            <div className="flex items-center">
              {col.isPrimaryKey && (
                <span className="text-yellow-500 mr-1 font-bold">PK</span>
              )}
              <span
                className={`font-mono ${col.isPrimaryKey ? "font-bold" : ""}`}
              >
                {col.name}
              </span>
            </div>
            <span className="text-gray-500 text-xs ml-4">
              {col.type} {col.nullable ? "" : "NOT NULL"}
            </span>

            {/* Handles for edges */}
            <Handle
              type="target"
              position={Position.Left}
              id={`target-${col.name}`}
              className="!bg-transparent !border-none !w-1 !h-1"
              style={{ top: "50%" }}
            />
            <Handle
              type="source"
              position={Position.Right}
              id={`source-${col.name}`}
              className="!bg-transparent !border-none !w-1 !h-1"
              style={{ top: "50%" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

const nodeTypes = {
  tableNode: TableNode,
};

export const SchemaViewer: React.FC<SchemaViewerProps> = ({ tables }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Layout logic (simple horizontal layout for now)
  useEffect(() => {
    if (!tables.length) return;

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    let x = 100;
    let y = 100;

    // Create nodes
    tables.forEach((table, index) => {
      newNodes.push({
        id: table.name,
        type: "tableNode",
        position: {
          x: x + (index % 3) * 350,
          y: y + Math.floor(index / 3) * 350,
        },
        data: { table },
      });
    });

    // Create edges based on Foreign Keys
    tables.forEach((table) => {
      table.foreignKeys.forEach((fk) => {
        newEdges.push({
          id: `e-${table.name}-${fk.column}-${fk.referencedTable}-${fk.referencedColumn}`,
          source: table.name,
          sourceHandle: `source-${fk.column}`,
          target: fk.referencedTable,
          targetHandle: `target-${fk.referencedColumn}`,
          animated: true,
          style: { stroke: "#4f46e5", strokeWidth: 2 },
        });
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [tables, setNodes, setEdges]);

  return (
    <div
      style={{ height: "70vh", width: "100%" }}
      className="border border-gray-300 rounded-lg"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background gap={12} size={1} />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
};
