import { ChevronDown, GripVertical, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DbColumn, DbColumnConstraint, DbColumnNullable, DbIndex, DbTable } from "../domain";
import { uid } from "../lib/id";
import { IconButton } from "./ui";

const PG_TYPES = [
  "UUID",
  "TEXT",
  "VARCHAR",
  "CHAR",
  "BOOLEAN",
  "SMALLINT",
  "INTEGER",
  "BIGINT",
  "SERIAL",
  "BIGSERIAL",
  "NUMERIC",
  "DECIMAL",
  "REAL",
  "DOUBLE PRECISION",
  "DATE",
  "TIME",
  "TIMESTAMP",
  "TIMESTAMPTZ",
  "JSON",
  "JSONB",
  "BYTEA",
  "INET",
  "CIDR",
  "MONEY",
];
const NULLABLE_OPTIONS: DbColumnNullable[] = ["YES", "NO"];
const CONSTRAINT_OPTIONS: DbColumnConstraint[] = ["NONE", "PRIMARY KEY", "UNIQUE", "FOREIGN KEY", "CHECK", "DEFAULT", "INDEX"];
const INDEX_TYPES: DbIndex["type"][] = ["BTREE", "HASH", "GIN", "GIST", "BRIN"];

export function DbSchemaPage({ tables, selectedTableId, onChange }: { tables: DbTable[]; selectedTableId: string; onChange: (tables: DbTable[]) => void }) {
  const [draggedColumnId, setDraggedColumnId] = useState("");
  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? tables[0];
  const updateTable = (id: string, patch: Partial<DbTable>) => {
    onChange(tables.map((table) => table.id === id ? { ...table, ...patch } : table));
  };
  const addColumn = (tableId: string) => {
    onChange(tables.map((table) => table.id === tableId ? {
      ...table,
      columns: [...table.columns, { id: uid(), field: "", type: "UUID", nullable: "NO", constraint: "NONE", description: "" }],
    } : table));
  };
  const updateColumn = (tableId: string, columnId: string, patch: Partial<DbColumn>) => {
    onChange(tables.map((table) => table.id === tableId ? {
      ...table,
      columns: table.columns.map((column) => column.id === columnId ? { ...column, ...patch } : column),
    } : table));
  };
  const addIndex = (tableId: string) => {
    onChange(tables.map((table) => {
      if (table.id !== tableId) return table;
      const column = table.columns[0];
      const index: DbIndex = {
        id: uid(),
        name: column ? `idx_${table.name || "table"}_${column.field || "column"}` : "",
        columnIds: column?.id ? [column.id] : [],
        type: "BTREE",
        unique: "NO",
      };
      return { ...table, indexes: [...(table.indexes ?? []), index] };
    }));
  };
  const updateIndex = (tableId: string, indexId: string, patch: Partial<DbIndex>) => {
    onChange(tables.map((table) => table.id === tableId ? {
      ...table,
      indexes: (table.indexes ?? []).map((index) => index.id === indexId ? { ...index, ...patch } : index),
    } : table));
  };
  const moveColumn = (tableId: string, sourceColumnId: string, targetColumnId: string) => {
    if (!sourceColumnId || sourceColumnId === targetColumnId) return;
    onChange(tables.map((table) => {
      if (table.id !== tableId) return table;
      const sourceIndex = table.columns.findIndex((column) => column.id === sourceColumnId);
      const targetIndex = table.columns.findIndex((column) => column.id === targetColumnId);
      if (sourceIndex < 0 || targetIndex < 0) return table;
      const columns = [...table.columns];
      const [sourceColumn] = columns.splice(sourceIndex, 1);
      columns.splice(targetIndex, 0, sourceColumn);
      return { ...table, columns };
    }));
  };

  return (
    <section className="panel code-page">
      <div className="panel-title page-title">
        <div>
          <h3>{selectedTable?.name || "DB Schema"}</h3>
        </div>
      </div>
      <div className="code-list">
        {selectedTable ? (
          <div className="code-group" key={selectedTable.id}>
            <div className="schema-table-title">
              <input value={selectedTable.name} placeholder="table_name" onChange={(event) => updateTable(selectedTable.id, { name: event.target.value })} />
              <IconButton label="Remove table" onClick={() => onChange(tables.filter((item) => item.id !== selectedTable.id))} />
            </div>
            {selectedTable.columns.length > 0 && (
              <div className="table-header schema-row">
                <span />
                <span>Field</span>
                <span>Type</span>
                <span>Nullable</span>
                <span>Constraint</span>
                <span>Description</span>
                <span />
              </div>
            )}
            {selectedTable.columns.map((column) => (
              <div
                className={draggedColumnId === column.id ? "row schema-row dragging" : "row schema-row"}
                key={column.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  moveColumn(selectedTable.id, event.dataTransfer.getData("text/plain") || draggedColumnId, column.id);
                  setDraggedColumnId("");
                }}
              >
                <span
                  className="drag-handle"
                  draggable
                  role="button"
                  tabIndex={0}
                  title="Drag to reorder field"
                  aria-label="Drag to reorder field"
                  onDragStart={(event) => {
                    setDraggedColumnId(column.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", column.id);
                  }}
                  onDragEnd={() => setDraggedColumnId("")}
                >
                  <GripVertical size={16} />
                </span>
                <input value={column.field} placeholder="id" onChange={(event) => updateColumn(selectedTable.id, column.id, { field: event.target.value })} />
                <SearchableSelect
                  value={column.type.toUpperCase()}
                  options={PG_TYPES}
                  placeholder="Search PG type"
                  onChange={(type) => updateColumn(selectedTable.id, column.id, { type: type.toUpperCase() })}
                />
                <select value={column.nullable} onChange={(event) => updateColumn(selectedTable.id, column.id, { nullable: event.target.value as DbColumnNullable })}>
                  {NULLABLE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                <SearchableSelect
                  value={column.constraint}
                  options={CONSTRAINT_OPTIONS}
                  placeholder="Search constraint"
                  onChange={(constraint) => updateColumn(selectedTable.id, column.id, { constraint: constraint as DbColumnConstraint })}
                  onCommit={(constraint) => {
                    if (!CONSTRAINT_OPTIONS.includes(constraint as DbColumnConstraint)) updateColumn(selectedTable.id, column.id, { constraint: "NONE" });
                  }}
                />
                <input value={column.description} placeholder="Column purpose, rule, or relation" onChange={(event) => updateColumn(selectedTable.id, column.id, { description: event.target.value })} />
                <IconButton label="Remove column" onClick={() => updateTable(selectedTable.id, { columns: selectedTable.columns.filter((item) => item.id !== column.id) })} />
              </div>
            ))}
            <button type="button" onClick={() => addColumn(selectedTable.id)}><Plus size={16} /> Add Column</button>
            <div className="schema-index-section">
              <div className="subgroup-title">
                <h4>Indexes</h4>
                <button type="button" onClick={() => addIndex(selectedTable.id)} disabled={selectedTable.columns.length === 0}><Plus size={16} /> Add Index</button>
              </div>
              {(selectedTable.indexes ?? []).length > 0 && (
                <div className="table-header schema-index-row">
                  <span>Name</span>
                  <span>Columns</span>
                  <span>Type</span>
                  <span>Unique</span>
                  <span />
                </div>
              )}
              {(selectedTable.indexes ?? []).map((index) => (
                <div className="row schema-index-row" key={index.id}>
                  <input value={index.name} placeholder="idx_table_column" onChange={(event) => updateIndex(selectedTable.id, index.id, { name: event.target.value })} />
                  <MultiSelectDropdown
                    options={selectedTable.columns.map((column) => ({ label: column.field || "Unnamed column", value: column.id }))}
                    values={index.columnIds}
                    placeholder="Select columns"
                    onChange={(columnIds) => updateIndex(selectedTable.id, index.id, { columnIds })}
                  />
                  <select value={index.type} onChange={(event) => updateIndex(selectedTable.id, index.id, { type: event.target.value as DbIndex["type"] })}>
                    {INDEX_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                  <select value={index.unique} onChange={(event) => updateIndex(selectedTable.id, index.id, { unique: event.target.value as DbIndex["unique"] })}>
                    <option value="NO">NO</option>
                    <option value="YES">YES</option>
                  </select>
                  <IconButton label="Remove index" onClick={() => updateTable(selectedTable.id, { indexes: (selectedTable.indexes ?? []).filter((item) => item.id !== index.id) })} />
                </div>
              ))}
              {selectedTable.columns.length === 0 && <p className="empty code-empty">Create columns before adding indexes.</p>}
            </div>
          </div>
        ) : (
          <p className="empty code-empty">Create a table from the DB Schema tree.</p>
        )}
      </div>
    </section>
  );
}

function MultiSelectDropdown({
  options,
  values,
  placeholder,
  onChange,
}: {
  options: Array<{ label: string; value: string }>;
  values: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabels = options.filter((option) => values.includes(option.value)).map((option) => option.label);

  return (
    <div className="multi-select">
      <button type="button" className="multi-select-trigger" onClick={() => setOpen((current) => !current)}>
        <span>{selectedLabels.length > 0 ? selectedLabels.join(", ") : placeholder}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="multi-select-options">
          {options.map((option) => {
            const selected = values.includes(option.value);
            return (
              <label key={option.value}>
                <input
                  checked={selected}
                  type="checkbox"
                  onChange={(event) => {
                    const nextValues = event.target.checked
                      ? [...values, option.value]
                      : values.filter((value) => value !== option.value);
                    onChange(nextValues);
                  }}
                />
                <span>{option.label}</span>
              </label>
            );
          })}
          {options.length === 0 && <span className="multi-select-empty">No columns</span>}
        </div>
      )}
    </div>
  );
}

function SearchableSelect({
  value,
  options,
  placeholder,
  onChange,
  onCommit,
}: {
  value: string;
  options: readonly string[];
  placeholder: string;
  onChange: (value: string) => void;
  onCommit?: (value: string) => void;
}) {
  const [inputValue, setInputValue] = useState(value);
  const [open, setOpen] = useState(false);
  const filteredOptions = useMemo(() => {
    const query = inputValue.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => option.toLowerCase().includes(query));
  }, [inputValue, options]);

  useEffect(() => {
    if (open) return;
    setInputValue(value);
  }, [open, value]);

  return (
    <div className="searchable-select">
      <input
        value={inputValue}
        placeholder={placeholder}
        onFocus={() => {
          setInputValue(value);
          setOpen(true);
        }}
        onChange={(event) => {
          setInputValue(event.target.value);
          setOpen(true);
          onChange(event.target.value);
        }}
        onBlur={() => {
          setOpen(false);
          onCommit?.(inputValue);
        }}
      />
      <button type="button" aria-label="Open options" onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen((current) => !current)}>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="searchable-options">
          {filteredOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={option === value ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setInputValue(option);
                onChange(option);
                onCommit?.(option);
                setOpen(false);
              }}
            >
              {option}
            </button>
          ))}
          {filteredOptions.length === 0 && <span>No options</span>}
        </div>
      )}
    </div>
  );
}
