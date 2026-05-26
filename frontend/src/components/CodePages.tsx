import { useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import type { ErrorCode, EventCode } from "../domain";
import { IconButton } from "./ui";

export function EventCodesPage({ rows, onAdd, onChange }: { rows: EventCode[]; onAdd: () => void; onChange: (rows: EventCode[]) => void }) {
  const update = (id: string, patch: Partial<EventCode>) => onChange(rows.map((row) => row.id === id ? { ...row, ...patch } : row));

  return (
    <section className="panel code-page">
      <div className="panel-title page-title">
        <div>
          <h3>Event Codes</h3>
          <span>Stored at project.event_code</span>
        </div>
        <button className="primary" type="button" onClick={onAdd}><Plus size={16} /> Add Event Code</button>
      </div>
      <div className="table-header event-row">
        <span>Code</span>
        <span>Name</span>
        <span>Description</span>
        <span />
      </div>
      <div className="code-list">
        {rows.map((row) => (
          <div className="row event-row" key={row.id}>
            <input value={row.code} placeholder="USER_CREATED" onChange={(event) => update(row.id, { code: event.target.value })} />
            <input value={row.name} placeholder="User Created" onChange={(event) => update(row.id, { name: event.target.value })} />
            <input value={row.description} placeholder="When this event is emitted" onChange={(event) => update(row.id, { description: event.target.value })} />
            <IconButton label="Remove event code" onClick={() => onChange(rows.filter((item) => item.id !== row.id))} />
          </div>
        ))}
        {rows.length === 0 && <p className="empty code-empty">No event codes yet.</p>}
      </div>
    </section>
  );
}

export function ErrorCodesPage({
  rows,
  onAddDomain,
  onAddErrorCode,
  onChange,
}: {
  rows: ErrorCode[];
  onAddDomain: () => void;
  onAddErrorCode: (domain?: string) => void;
  onChange: (rows: ErrorCode[]) => void;
}) {
  const [collapsedDomains, setCollapsedDomains] = useState<Set<string>>(() => new Set());
  const update = (id: string, patch: Partial<ErrorCode>) => onChange(rows.map((row) => row.id === id ? { ...row, ...patch } : row));
  const toggleDomain = (domain: string) => {
    setCollapsedDomains((current) => {
      const next = new Set(current);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };
  const groups = rows.reduce<Array<{ domain: string; rows: ErrorCode[] }>>((items, row) => {
    const domain = row.domain || "general";
    const group = items.find((item) => item.domain === domain);
    if (group) group.rows.push(row);
    else items.push({ domain, rows: [row] });
    return items;
  }, []);

  return (
    <section className="panel code-page">
      <div className="panel-title page-title">
        <div>
          <h3>Error Codes</h3>
        </div>
        <button className="primary" type="button" onClick={onAddDomain}><Plus size={16} /> Add Domain</button>
      </div>
      <div className="code-list">
        {groups.map((group) => (
          <div className="code-group" key={group.domain}>
            <div
              className="code-group-title"
              role="button"
              tabIndex={0}
              aria-expanded={!collapsedDomains.has(group.domain)}
              onClick={() => toggleDomain(group.domain)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleDomain(group.domain);
                }
              }}
            >
              <div className="domain-toggle">
                {collapsedDomains.has(group.domain) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                <span>{group.domain}</span>
                <small>{group.rows.length}</small>
              </div>
              <button type="button" onClick={(event) => { event.stopPropagation(); onAddErrorCode(group.domain); }}><Plus size={16} /> Add Error Code</button>
            </div>
            {!collapsedDomains.has(group.domain) && (
              <>
                <div className="table-header error-row">
                  <span>HTTP</span>
                  <span>Code</span>
                  <span>Message EN</span>
                  <span>Description EN</span>
                  <span>Message TH</span>
                  <span>Description TH</span>
                  <span />
                </div>
                {group.rows.map((row) => (
                  <div className="row error-row" key={row.id}>
                    <input value={row.status} placeholder="400" onChange={(event) => update(row.id, { status: event.target.value })} />
                    <input value={row.code} placeholder="040001" onChange={(event) => update(row.id, { code: event.target.value })} />
                    <input value={row.message_en} placeholder="invalid request" onChange={(event) => update(row.id, { message_en: event.target.value })} />
                    <input value={row.description_en} placeholder="When this error is returned" onChange={(event) => update(row.id, { description_en: event.target.value })} />
                    <input value={row.message_th} placeholder="ข้อความภาษาไทย" onChange={(event) => update(row.id, { message_th: event.target.value })} />
                    <input value={row.description_th} placeholder="รายละเอียดภาษาไทย" onChange={(event) => update(row.id, { description_th: event.target.value })} />
                    <IconButton label="Remove error code" onClick={() => onChange(rows.filter((item) => item.id !== row.id))} />
                  </div>
                ))}
              </>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="empty code-empty">No error codes yet.</p>}
      </div>
    </section>
  );
}
