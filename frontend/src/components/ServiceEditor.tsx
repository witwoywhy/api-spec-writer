import { Plus } from "lucide-react";
import type { ErrorCode, FieldRow, HttpMethod, MappingSection, RequestLocation, RequireFlag, ResponseLocation, ServiceSpec, ServiceType } from "../domain";
import { uid } from "../lib/id";
import { parseJsonFields } from "../lib/jsonFieldParser";
import { Fieldset, IconButton, Label } from "./ui";

const REQUEST_LOCATIONS: RequestLocation[] = ["HEADER", "PATH PARAM", "QUERY PARAM", "BODY"];
const RESPONSE_LOCATIONS: ResponseLocation[] = ["HEADER", "BODY"];
const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const SERVICE_TYPES: ServiceType[] = ["http", "publisher", "subscriber", "scheduler"];
const REQUIRED: RequireFlag[] = ["YES", "NO"];

export function ServiceEditor({
  spec,
  projectErrorCodes,
  onChange,
}: {
  spec: ServiceSpec;
  projectErrorCodes: ErrorCode[];
  onChange: (updater: (spec: ServiceSpec) => ServiceSpec) => void;
}) {
  const serviceType = spec.type ?? "http";
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
          <Label text="Description" wide><textarea value={spec.description} onChange={(event) => patch({ description: event.target.value })} /></Label>
        </div>
      </Fieldset>

      <Fieldset title="Request">
        <FieldRows
          rows={spec.requestFields}
          locations={REQUEST_LOCATIONS}
          addLabel="Add Request Field"
          exampleLocation="BODY"
          exampleLabel="Example JSON or path/query"
          exampleValue={spec.requestExample}
          onExampleChange={(requestExample) => patch({ requestExample })}
          onParseExample={(fields) => onChange((current) => ({ ...current, requestFields: [...current.requestFields.filter((row) => row.location !== "BODY"), ...fields] }))}
          onAdd={(location) => addField("requestFields", location)}
          onUpdate={(id, row) => updateField("requestFields", id, row)}
          onRemove={(id) => removeField("requestFields", id)}
        />
      </Fieldset>

      <Fieldset title="Sequence Diagram">
        <Label text="Mermaid"><textarea className="tall" value={spec.sequence} onChange={(event) => patch({ sequence: event.target.value })} /></Label>
      </Fieldset>

      <Fieldset title="Errors">
        {spec.errors.length > 0 && (
          <div className="table-header error-row">
            <span>HTTP</span>
            <span>Code</span>
            <span>Message EN</span>
            <span>Description EN</span>
            <span>Message TH</span>
            <span>Description TH</span>
            <span />
          </div>
        )}
        {spec.errors.map((row) => (
          <ServiceErrorRow
            key={row.id}
            row={row}
            projectErrorCodes={projectErrorCodes}
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
                errorCode ? { ...errorCode, id: uid(), errorCodeId: errorCode.id } : { id: uid(), domain: "general", status: "", code: "", message_th: "", description_th: "", message_en: "", description_en: "" },
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
          exampleLabel="Example JSON"
          exampleValue={spec.responseExample}
          onExampleChange={(responseExample) => patch({ responseExample })}
          onParseExample={(fields) => onChange((current) => ({ ...current, responseFields: [...current.responseFields.filter((row) => row.location !== "BODY"), ...fields] }))}
          onAdd={(location) => addField("responseFields", location)}
          onUpdate={(id, row) => updateField("responseFields", id, row)}
          onRemove={(id) => removeField("responseFields", id)}
        />
      </Fieldset>

      <MappingEditor sections={spec.mappingSections} onChange={(mappingSections) => patch({ mappingSections })} />
    </>
  );
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
  onExampleChange,
  onParseExample,
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
  onExampleChange?: (value: string) => void;
  onParseExample?: (rows: FieldRow[]) => void;
}) {
  return (
    <div className="field-groups">
      {locations.map((location) => {
        const locationRows = rows.filter((row) => row.location === location);
        return (
          <div className="subgroup" key={location}>
            <div className="subgroup-title">
              <h4>{location}</h4>
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
            {exampleLocation === location && onExampleChange && (
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
                <textarea value={exampleValue ?? ""} onChange={(event) => onExampleChange(event.target.value)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ServiceErrorRow({
  row,
  projectErrorCodes,
  onSelect,
  onRemove,
}: {
  row: ErrorCode;
  projectErrorCodes: ErrorCode[];
  onSelect: (errorCodeId: string) => void;
  onRemove: () => void;
}) {
  const selectedErrorCode = projectErrorCodes.find((errorCode) => errorCode.id === row.errorCodeId) ?? projectErrorCodes.find((errorCode) => errorCode.code === row.code);
  const resolved = selectedErrorCode ?? row;

  return (
    <div className="row error-row">
      <input value={resolved.status} placeholder="HTTP" readOnly />
      <select value={selectedErrorCode?.id ?? ""} onChange={(event) => onSelect(event.target.value)}>
        <option value="" disabled>{resolved.code || "Select error"}</option>
        {projectErrorCodes.map((errorCode) => (
          <option key={errorCode.id} value={errorCode.id}>{errorCode.code}</option>
        ))}
      </select>
      <input value={resolved.message_en} placeholder="message" readOnly />
      <input value={resolved.description_en} placeholder="when this happens" readOnly />
      <input value={resolved.message_th} placeholder="ข้อความภาษาไทย" readOnly />
      <input value={resolved.description_th} placeholder="รายละเอียดภาษาไทย" readOnly />
      <IconButton label="Remove error" onClick={onRemove} />
    </div>
  );
}

function MappingEditor({ sections, onChange }: { sections: MappingSection[]; onChange: (sections: MappingSection[]) => void }) {
  return (
    <Fieldset title="Field to Field Mapping">
      <button type="button" onClick={() => onChange([...sections, { id: uid(), name: "", rows: [] }])}><Plus size={16} /> Add Mapping Section</button>
      {sections.map((section) => (
        <div className="subgroup" key={section.id}>
          <div className="subgroup-title">
            <input value={section.name} placeholder="Mapping section name" onChange={(event) => onChange(sections.map((item) => item.id === section.id ? { ...item, name: event.target.value } : item))} />
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
