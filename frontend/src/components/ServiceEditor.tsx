import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import type { Extension } from "@codemirror/state";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { ChevronDown, Edit3, Plus, Trash2 } from "lucide-react";
import { type DragEvent, type TextareaHTMLAttributes, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DbTable, ErrorCode, ExampleCase, FieldRow, HttpMethod, MappingSection, RequestLocation, RequireFlag, ResponseLocation, ServiceSpec, ServiceType } from "../domain";
import { uid } from "../lib/id";
import { parseJsonFields } from "../lib/jsonFieldParser";
import { Fieldset, IconButton, Label } from "./ui";

const REQUEST_LOCATIONS: RequestLocation[] = ["BODY", "HEADER", "PATH PARAM", "QUERY PARAM", "FORM-DATA", "X-WWW-FORM-URLENCODED"];
const RESPONSE_LOCATIONS: ResponseLocation[] = ["HEADER", "BODY"];
const REQUEST_BODY_LOCATIONS: RequestLocation[] = ["BODY", "FORM-DATA", "X-WWW-FORM-URLENCODED"];
const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const SERVICE_TYPES: ServiceType[] = ["http", "publisher", "subscriber", "scheduler"];
const REQUIRED: RequireFlag[] = ["YES", "NO"];
const HTTP_STATUS_CODES = ["200", "201", "202", "204", "400", "401", "403", "404", "409", "422", "429", "500", "502", "503"];
const INDENTATION_MARKERS = indentationMarkers({
  colors: {
    light: "#d7dee5",
    activeLight: "#aebac5",
  },
  highlightActiveBlock: false,
});
const JSON_EDITOR_EXTENSIONS = [json(), INDENTATION_MARKERS];
const TEXT_EDITOR_EXTENSIONS = [INDENTATION_MARKERS];

export function ServiceEditor({
  spec,
  projectErrorCodes,
  projectDbSchema,
  onChange,
}: {
  spec: ServiceSpec;
  projectErrorCodes: ErrorCode[];
  projectDbSchema: DbTable[];
  onChange: (updater: (spec: ServiceSpec) => ServiceSpec) => void;
}) {
  const serviceType = spec.type ?? "http";
  const [draggedErrorId, setDraggedErrorId] = useState("");
  const [dropErrorId, setDropErrorId] = useState("");
  const patch = (partial: Partial<ServiceSpec>) => onChange((current) => ({ ...current, ...partial }));
  const addField = (key: "requestFields" | "responseFields", location: RequestLocation | ResponseLocation) => {
    onChange((current) => ({
      ...current,
      [key]: [...current[key], { id: uid(), location, field: "", type: "", require: "YES", description: "" }],
    }));
  };
  const updateField = (key: "requestFields" | "responseFields", id: string, patchRow: Partial<FieldRow>) => {
    onChange((current) => ({ ...current, [key]: current[key].map((row) => row.id === id ? { ...row, ...patchRow } : row) }));
  };
  const removeField = (key: "requestFields" | "responseFields", id: string) => {
    onChange((current) => ({ ...current, [key]: current[key].filter((row) => row.id !== id) }));
  };
  const clearErrorDrag = () => {
    setDraggedErrorId("");
    setDropErrorId("");
  };
  const moveError = (sourceId: string, targetId: string) => {
    if (!sourceId || sourceId === targetId) return;
    onChange((current) => ({ ...current, errors: moveById(current.errors, sourceId, targetId) }));
  };

  return (
    <>
      <div className="panel-title">
        <h3>Service Spec</h3>
      </div>
      <Fieldset title="Header">
        <div className="grid two">
          <Label text="Name"><input value={spec.name} onChange={(event) => patch({ name: event.target.value })} /></Label>
          <Label text="Type">
            <select value={serviceType} onChange={(event) => patch({ type: event.target.value as ServiceType })}>
              {SERVICE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </Label>
          {serviceType === "http" && (
            <>
              <Label text="Method">
                <select value={spec.method} onChange={(event) => patch({ method: event.target.value as HttpMethod })}>
                  {METHODS.map((method) => <option key={method}>{method}</option>)}
                </select>
              </Label>
              <Label text="URL"><input value={spec.url} onChange={(event) => patch({ url: event.target.value })} /></Label>
            </>
          )}
          <Label text="Authentication"><input value={spec.authentication} onChange={(event) => patch({ authentication: event.target.value })} /></Label>
          <Label text="Description" wide><SmartTextarea value={spec.description} onChangeValue={(value) => patch({ description: value })} /></Label>
        </div>
      </Fieldset>

      <Fieldset title="Request">
        <FieldRows
          rows={spec.requestFields}
          locations={REQUEST_LOCATIONS}
          addLabel="Add Request Field"
          singleLocationSelector
          exampleLocation="BODY"
          exampleLabel="Request Examples"
          examples={spec.requestExamples}
          onExamplesChange={(requestExamples) => patch({ requestExamples, requestExample: requestExamples[0]?.value ?? "" })}
          onParseExamples={(requestExamples, fields) => onChange((current) => ({
            ...current,
            requestExample: requestExamples[0]?.value ?? "",
            requestExamples,
            requestFields: [...current.requestFields.filter((row) => row.location !== "BODY"), ...fields],
          }))}
          onParseExample={(fields) => onChange((current) => ({ ...current, requestFields: [...current.requestFields.filter((row) => row.location !== "BODY"), ...fields] }))}
          onAdd={(location) => addField("requestFields", location)}
          onUpdate={(id, row) => updateField("requestFields", id, row)}
          onRemove={(id) => removeField("requestFields", id)}
        />
      </Fieldset>

      <Fieldset title="Sequence Diagram">
        <Label text="Mermaid"><CodeTextarea className="tall" value={spec.sequence} onChangeValue={(value) => patch({ sequence: value })} extensions={TEXT_EDITOR_EXTENSIONS} height="220px" /></Label>
      </Fieldset>

      <Fieldset title="Errors">
        {spec.errors.length > 0 && (
          <div className="table-header error-row">
            <span>HTTP</span>
            <span>Code</span>
            <span>Description</span>
            <span />
          </div>
        )}
        {spec.errors.map((row) => (
          <ServiceErrorRow
            key={row.id}
            row={row}
            className={serviceErrorRowClass(row.id, draggedErrorId, dropErrorId)}
            projectErrorCodes={projectErrorCodes}
            onDragEnd={clearErrorDrag}
            onDragLeave={() => {
              if (dropErrorId === row.id) setDropErrorId("");
            }}
            onDragOver={(event) => {
              if (!draggedErrorId || draggedErrorId === row.id) return;
              event.preventDefault();
              setDropErrorId(row.id);
            }}
            onDragStart={(event) => {
              setDraggedErrorId(row.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", row.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              moveError(event.dataTransfer.getData("text/plain") || draggedErrorId, row.id);
              clearErrorDrag();
            }}
            onSelect={(errorCodeId) => {
              const selected = projectErrorCodes.find((errorCode) => errorCode.id === errorCodeId);
              if (!selected) return;
              onChange((current) => ({
                ...current,
                errors: current.errors.map((item) => item.id === row.id ? { ...selected, id: item.id, errorCodeId: selected.id } : item),
              }));
            }}
            onRemove={() => onChange((current) => ({ ...current, errors: current.errors.filter((item) => item.id !== row.id) }))}
          />
        ))}
        <button
          type="button"
          onClick={() => {
            const errorCode = projectErrorCodes[0];
            onChange((current) => ({
              ...current,
              errors: [
                ...current.errors,
                errorCode ? { ...errorCode, id: uid(), errorCodeId: errorCode.id } : { id: uid(), domain: "general", status: "", code: "", description: "", message_th: "", description_th: "", message_en: "", description_en: "" },
              ],
            }));
          }}
        >
          <Plus size={16} /> Add Error
        </button>
      </Fieldset>

      <Fieldset title="Response">
        <FieldRows
          rows={spec.responseFields}
          locations={RESPONSE_LOCATIONS}
          addLabel="Add Response Field"
          exampleLocation="BODY"
          exampleLabel="Response Examples"
          examples={spec.responseExamples}
          includeStatus
          onExamplesChange={(responseExamples) => patch({ responseExamples, responseExample: responseExamples[0]?.value ?? "" })}
          onParseExamples={(responseExamples, fields) => onChange((current) => ({
            ...current,
            responseExample: responseExamples[0]?.value ?? "",
            responseExamples,
            responseFields: [...current.responseFields.filter((row) => row.location !== "BODY"), ...fields],
          }))}
          onParseExample={(fields) => onChange((current) => ({ ...current, responseFields: [...current.responseFields.filter((row) => row.location !== "BODY"), ...fields] }))}
          onAdd={(location) => addField("responseFields", location)}
          onUpdate={(id, row) => updateField("responseFields", id, row)}
          onRemove={(id) => removeField("responseFields", id)}
        />
      </Fieldset>

      <MappingEditor sections={spec.mappingSections} dbSchema={projectDbSchema} onChange={(mappingSections) => patch({ mappingSections })} />
    </>
  );
}

function moveById<T extends { id: string }>(items: T[], sourceId: string, targetId: string) {
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return items;
  const next = [...items];
  const [source] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, source);
  return next;
}

function serviceErrorRowClass(id: string, draggedId: string, dropId: string) {
  const classes = ["row", "error-row", "service-error-row"];
  if (draggedId === id) classes.push("dragging");
  if (dropId === id) classes.push("drop-target");
  return classes.join(" ");
}

function FieldRows({
  rows,
  locations,
  addLabel,
  onAdd,
  onUpdate,
  onRemove,
  exampleLocation,
  exampleLabel,
  exampleValue,
  examples,
  includeStatus,
  onExampleChange,
  onExamplesChange,
  onParseExamples,
  onParseExample,
  singleLocationSelector = false,
}: {
  rows: FieldRow[];
  locations: (RequestLocation | ResponseLocation)[];
  addLabel: string;
  onAdd: (location: RequestLocation | ResponseLocation) => void;
  onUpdate: (id: string, row: Partial<FieldRow>) => void;
  onRemove: (id: string) => void;
  exampleLocation?: RequestLocation | ResponseLocation;
  exampleLabel?: string;
  exampleValue?: string;
  examples?: ExampleCase[];
  includeStatus?: boolean;
  onExampleChange?: (value: string) => void;
  onExamplesChange?: (examples: ExampleCase[]) => void;
  onParseExamples?: (examples: ExampleCase[], rows: FieldRow[]) => void;
  onParseExample?: (rows: FieldRow[]) => void;
  singleLocationSelector?: boolean;
}) {
  const [selectedLocation, setSelectedLocation] = useState<RequestLocation | ResponseLocation>(locations[0]);
  const visibleLocations = singleLocationSelector ? [selectedLocation] : locations;
  const lockedBodyLocation = singleLocationSelector
    ? REQUEST_BODY_LOCATIONS.find((location) => rows.some((row) => row.location === location))
    : undefined;

  useEffect(() => {
    if (locations.includes(selectedLocation)) return;
    setSelectedLocation(locations[0]);
  }, [locations, selectedLocation]);

  useEffect(() => {
    if (!lockedBodyLocation || !REQUEST_BODY_LOCATIONS.includes(selectedLocation as RequestLocation)) return;
    if (selectedLocation === lockedBodyLocation) return;
    setSelectedLocation(lockedBodyLocation);
  }, [lockedBodyLocation, selectedLocation]);

  return (
    <div className="field-groups">
      {visibleLocations.map((location) => {
        const locationRows = rows.filter((row) => row.location === location);
        return (
          <div className="subgroup" key={location}>
            <div className="subgroup-title">
              {singleLocationSelector ? (
                <select
                  className="location-select"
                  value={location}
                  onChange={(event) => setSelectedLocation(event.target.value as RequestLocation | ResponseLocation)}
                  aria-label="Request field type"
                >
                  {locations.map((option) => (
                    <option
                      key={option}
                      value={option}
                      disabled={Boolean(lockedBodyLocation && REQUEST_BODY_LOCATIONS.includes(option as RequestLocation) && option !== lockedBodyLocation)}
                    >
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <h4>{location}</h4>
              )}
              <button type="button" onClick={() => onAdd(location)}><Plus size={16} /> {addLabel}</button>
            </div>
            {locationRows.length > 0 && (
              <div className="field-row-header field-row" aria-hidden="true">
                <span>Field</span>
                <span>Type</span>
                <span>Required</span>
                <span>Description</span>
                <span />
              </div>
            )}
            {locationRows.map((row) => (
              <div className="row field-row" key={row.id}>
                <input value={row.field} placeholder="field_name" onChange={(event) => onUpdate(row.id, { field: event.target.value })} />
                <input value={row.type} placeholder="type" onChange={(event) => onUpdate(row.id, { type: event.target.value })} />
                <select value={row.require} onChange={(event) => onUpdate(row.id, { require: event.target.value as RequireFlag })}>
                  {REQUIRED.map((option) => <option key={option}>{option}</option>)}
                </select>
                <input value={row.description} placeholder="validation, enum values, meaning" onChange={(event) => onUpdate(row.id, { description: event.target.value })} />
                <IconButton label="Remove field" onClick={() => onRemove(row.id)} />
              </div>
            ))}
            {exampleLocation === location && onExamplesChange && (
              <ExampleCases
                label={exampleLabel ?? "Examples"}
                examples={examples ?? []}
                location={location}
                includeStatus={includeStatus}
                onChange={onExamplesChange}
                onParseExamples={onParseExamples}
                onParseExample={onParseExample}
              />
            )}
            {exampleLocation === location && onExampleChange && !onExamplesChange && (
              <div className="example-section">
                <div className="example-title">
                  <span>{exampleLabel ?? "Example"}</span>
                  {onParseExample && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!exampleValue?.trim()) return;
                        try {
                          const fields = parseJsonFields(exampleValue ?? "", location);
                          onExampleChange(JSON.stringify(JSON.parse(exampleValue), null, 2));
                          if (fields.length > 0) onParseExample(fields);
                        } catch {
                          window.alert("Example must be valid JSON.");
                        }
                      }}
                    >
                      Parse JSON
                    </button>
                  )}
                </div>
                <CodeTextarea value={exampleValue ?? ""} onChangeValue={onExampleChange} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ExampleCases({
  label,
  examples,
  location,
  includeStatus = false,
  onChange,
  onParseExamples,
  onParseExample,
}: {
  label: string;
  examples: ExampleCase[];
  location: RequestLocation | ResponseLocation;
  includeStatus?: boolean;
  onChange: (examples: ExampleCase[]) => void;
  onParseExamples?: (examples: ExampleCase[], rows: FieldRow[]) => void;
  onParseExample?: (rows: FieldRow[]) => void;
}) {
  const [selectedExampleId, setSelectedExampleId] = useState(examples[0]?.id ?? "");
  const selectedExample = examples.find((example) => example.id === selectedExampleId) ?? examples[0];

  useEffect(() => {
    if (selectedExampleId && examples.some((example) => example.id === selectedExampleId)) return;
    setSelectedExampleId(examples[0]?.id ?? "");
  }, [examples, selectedExampleId]);

  const updateExample = (id: string, patch: Partial<ExampleCase>) => {
    onChange(examples.map((example) => example.id === id ? { ...example, ...patch } : example));
  };

  return (
    <div className="example-section">
      <div className="example-title">
        <span>{label}</span>
        <button
          type="button"
          onClick={() => {
            const example = { id: uid(), name: includeStatus ? "Success" : `Case ${examples.length + 1}`, status: includeStatus ? "200" : undefined, value: "" };
            onChange([example, ...examples]);
            setSelectedExampleId(example.id);
          }}
        >
          <Plus size={16} /> Add Example
        </button>
      </div>
      {selectedExample ? (
        <div className="example-case">
          <div className={includeStatus ? "example-case-title with-status" : "example-case-title"}>
            {includeStatus && (
              <select value={selectedExample.status ?? "200"} onChange={(event) => updateExample(selectedExample.id, { status: event.target.value })} aria-label="HTTP status code">
                {HTTP_STATUS_CODES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            )}
            <select value={selectedExample.id} onChange={(event) => setSelectedExampleId(event.target.value)} aria-label="Request example case">
              {examples.map((example, index) => (
                <option key={example.id} value={example.id}>{includeStatus ? `${example.status ?? "200"} ` : ""}{example.name || `Case ${index + 1}`}</option>
              ))}
            </select>
            <button
              className="icon-button"
              type="button"
              aria-label="Edit example name"
              title="Edit example name"
              onClick={() => {
                const name = window.prompt("Example case name", selectedExample.name);
                if (name?.trim()) updateExample(selectedExample.id, { name: name.trim() });
              }}
            >
              <Edit3 size={16} />
            </button>
            {onParseExample && (
              <button
                type="button"
                onClick={() => {
                  if (!selectedExample.value.trim()) return;
                  try {
                    const fields = parseJsonFields(selectedExample.value, location);
                    const value = JSON.stringify(JSON.parse(selectedExample.value), null, 2);
                    const nextExamples = examples.map((example) => example.id === selectedExample.id ? { ...example, value } : example);
                    if (onParseExamples) {
                      onParseExamples(nextExamples, fields);
                    } else {
                      onChange(nextExamples);
                      if (fields.length > 0) onParseExample(fields);
                    }
                  } catch {
                    window.alert("Example must be valid JSON.");
                  }
                }}
              >
                Parse JSON
              </button>
            )}
            <button
              className="icon-button"
              type="button"
              aria-label="Remove example"
              title="Remove example"
              onClick={() => {
                const nextExamples = examples.filter((item) => item.id !== selectedExample.id);
                onChange(nextExamples);
                setSelectedExampleId(nextExamples[0]?.id ?? "");
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
          <CodeTextarea value={selectedExample.value} onChangeValue={(value) => updateExample(selectedExample.id, { value })} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            const example = { id: uid(), name: includeStatus ? "Success" : "Default", status: includeStatus ? "200" : undefined, value: "" };
            onChange([example]);
            setSelectedExampleId(example.id);
          }}
        >
          Add {includeStatus ? "Response" : "Request"} Example
        </button>
      )}
    </div>
  );
}

function ServiceErrorRow({
  className,
  row,
  projectErrorCodes,
  onDragEnd,
  onDragLeave,
  onDragOver,
  onDragStart,
  onDrop,
  onSelect,
  onRemove,
}: {
  className: string;
  row: ErrorCode;
  projectErrorCodes: ErrorCode[];
  onDragEnd: () => void;
  onDragLeave: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onSelect: (errorCodeId: string) => void;
  onRemove: () => void;
}) {
  const selectedErrorCode = projectErrorCodes.find((errorCode) => errorCode.id === row.errorCodeId) ?? projectErrorCodes.find((errorCode) => errorCode.code === row.code);
  const resolved = selectedErrorCode ?? row;

  return (
    <div
      className={className}
      draggable
      onDragEnd={onDragEnd}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDragStart={onDragStart}
      onDrop={onDrop}
      title="Drag to reorder error"
    >
      <input value={resolved.status} placeholder="HTTP" readOnly />
      <ErrorCodeSearchableSelect
        value={selectedErrorCode?.id ?? ""}
        options={projectErrorCodes}
        placeholder={resolved.code || "Select error"}
        onChange={onSelect}
      />
      <input value={resolved.description} placeholder="description" readOnly />
      <IconButton label="Remove error" onClick={onRemove} />
    </div>
  );
}

function ErrorCodeSearchableSelect({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: ErrorCode[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const selected = options.find((option) => option.id === value);
  const selectedLabel = selected?.code ?? "";
  const [inputValue, setInputValue] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const filteredOptions = useMemo(() => {
    const query = inputValue.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => errorCodeSearchText(option).includes(query));
  }, [inputValue, options]);

  useEffect(() => {
    if (open) return;
    setInputValue(selectedLabel);
  }, [open, selectedLabel]);

  return (
    <div className="searchable-select error-code-select">
      <input
        value={inputValue}
        placeholder={placeholder}
        onFocus={() => {
          setInputValue(selectedLabel);
          setOpen(true);
        }}
        onChange={(event) => {
          setInputValue(event.target.value);
          setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
          setInputValue(selectedLabel);
        }}
      />
      <button type="button" aria-label="Open error code options" onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen((current) => !current)}>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="searchable-options">
          {filteredOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={option.id === value ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setInputValue(option.code);
                onChange(option.id);
                setOpen(false);
              }}
            >
              <strong>{option.code}</strong>
              <small>{option.description || "-"}</small>
            </button>
          ))}
          {filteredOptions.length === 0 && <span>No options</span>}
        </div>
      )}
    </div>
  );
}

function errorCodeSearchText(errorCode: ErrorCode) {
  return [
    errorCode.status,
    errorCode.code,
    errorCode.domain,
    errorCode.message_en,
    errorCode.description_en,
    errorCode.message_th,
    errorCode.description_th,
  ].join(" ").toLowerCase();
}

function SmartTextarea({
  value,
  onChangeValue,
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & {
  value: string;
  onChangeValue: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);

  useLayoutEffect(() => {
    const selection = selectionRef.current;
    const textarea = ref.current;
    if (!selection || !textarea) return;
    textarea.setSelectionRange(selection.start, selection.end);
    selectionRef.current = null;
  }, [value]);

  const insertText = (text: string) => {
    const textarea = ref.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextValue = `${value.slice(0, start)}${text}${value.slice(end)}`;
    const nextCursor = start + text.length;
    selectionRef.current = { start: nextCursor, end: nextCursor };
    onChangeValue(nextValue);
  };

  return (
    <textarea
      {...props}
      ref={ref}
      value={value}
      onChange={(event) => {
        selectionRef.current = {
          start: event.target.selectionStart,
          end: event.target.selectionEnd,
        };
        onChangeValue(event.target.value);
      }}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "Tab") {
          event.preventDefault();
          insertText("  ");
        }
        if (event.key === "\"" && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          insertText("\"");
        }
      }}
    />
  );
}

function CodeTextarea({
  className = "",
  extensions = JSON_EDITOR_EXTENSIONS,
  height = "260px",
  value,
  onChangeValue,
}: {
  className?: string;
  extensions?: Extension[];
  height?: string;
  value: string;
  onChangeValue: (value: string) => void;
}) {
  const [editorHeight, setEditorHeight] = useState(() => Number.parseInt(height, 10) || 260);
  const [dragState, setDragState] = useState<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    if (!dragState) return;
    const onPointerMove = (event: PointerEvent) => {
      const nextHeight = dragState.startHeight + event.clientY - dragState.startY;
      setEditorHeight(Math.min(Math.max(nextHeight, 140), 900));
    };
    const onPointerUp = () => setDragState(null);

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [dragState]);

  return (
    <div className={`code-editor-frame ${className}`.trim()}>
      <CodeMirror
        className="code-editor"
        value={value}
        height={`${editorHeight}px`}
        basicSetup={{
          foldGutter: false,
          highlightActiveLine: true,
          lineNumbers: true,
        }}
        extensions={extensions}
        indentWithTab
        onChange={onChangeValue}
      />
      <div
        aria-label="Resize editor"
        className="code-editor-resize"
        onPointerDown={(event) => {
          event.preventDefault();
          setDragState({ startY: event.clientY, startHeight: editorHeight });
        }}
        role="separator"
      />
    </div>
  );
}

function MappingEditor({ sections, dbSchema, onChange }: { sections: MappingSection[]; dbSchema: DbTable[]; onChange: (sections: MappingSection[]) => void }) {
  const tableNames = useMemo(() => dbSchema.map((table) => table.name.trim()).filter(Boolean), [dbSchema]);
  const updateSectionName = (sectionId: string, name: string) => {
    const selectedTable = dbSchema.find((table) => table.name.trim() === name.trim());
    onChange(sections.map((section) => {
      if (section.id !== sectionId) return section;
      if (!selectedTable || section.rows.length > 0) return { ...section, name };
      return { ...section, name, rows: mappingRowsFromTable(selectedTable) };
    }));
  };
  return (
    <Fieldset title="Field to Field Mapping">
      <button type="button" onClick={() => onChange([...sections, { id: uid(), name: "", rows: [] }])}><Plus size={16} /> Add Mapping Section</button>
      {sections.map((section) => (
        <div className="subgroup" key={section.id}>
          <div className="subgroup-title">
            <MappingSectionNameSelect
              value={section.name}
              options={tableNames}
              onChange={(name) => updateSectionName(section.id, name)}
            />
            <IconButton label="Remove mapping section" onClick={() => onChange(sections.filter((item) => item.id !== section.id))} />
          </div>
          {section.rows.length > 0 && (
            <div className="table-header mapping-row" aria-hidden="true">
              <span>Target</span>
              <span>From</span>
              <span>Description</span>
              <span />
            </div>
          )}
          {section.rows.map((row) => (
            <div className="row mapping-row" key={row.id}>
              <input value={row.target} placeholder="target_field" onChange={(event) => onChange(sections.map((item) => item.id === section.id ? { ...item, rows: item.rows.map((entry) => entry.id === row.id ? { ...entry, target: event.target.value } : entry) } : item))} />
              <input value={row.from} placeholder="source_field" onChange={(event) => onChange(sections.map((item) => item.id === section.id ? { ...item, rows: item.rows.map((entry) => entry.id === row.id ? { ...entry, from: event.target.value } : entry) } : item))} />
              <input value={row.description} placeholder="transform, default, enum, generated value" onChange={(event) => onChange(sections.map((item) => item.id === section.id ? { ...item, rows: item.rows.map((entry) => entry.id === row.id ? { ...entry, description: event.target.value } : entry) } : item))} />
              <IconButton label="Remove mapping row" onClick={() => onChange(sections.map((item) => item.id === section.id ? { ...item, rows: item.rows.filter((entry) => entry.id !== row.id) } : item))} />
            </div>
          ))}
          <button type="button" onClick={() => onChange(sections.map((item) => item.id === section.id ? { ...item, rows: [...item.rows, { id: uid(), target: "", from: "", description: "" }] } : item))}><Plus size={16} /> Add Mapping Row</button>
        </div>
      ))}
    </Fieldset>
  );
}

function mappingRowsFromTable(table: DbTable) {
  return table.columns
    .map((column) => column.field.trim())
    .filter(Boolean)
    .map((target) => ({ id: uid(), target, from: "", description: "" }));
}

function MappingSectionNameSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
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
        placeholder="Mapping section name"
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
          onChange(inputValue);
        }}
      />
      <button type="button" aria-label="Open DB schema table options" onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen((current) => !current)}>
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
                setOpen(false);
              }}
            >
              {option}
            </button>
          ))}
          {filteredOptions.length === 0 && <span>No tables</span>}
        </div>
      )}
    </div>
  );
}
