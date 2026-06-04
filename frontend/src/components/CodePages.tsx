import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, GripVertical, Plus } from "lucide-react";
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

function errorDomainClass(domain: string, draggedDomain: string, dropDomain: string) {
  const classes = ["code-group"];
  if (draggedDomain === domain) classes.push("dragging");
  if (dropDomain === domain) classes.push("drop-target");
  return classes.join(" ");
}

function errorCodeRowClass(id: string, draggedErrorId: string, dropErrorId: string) {
  const classes = ["row error-code-row"];
  if (draggedErrorId === id) classes.push("dragging");
  if (dropErrorId === id) classes.push("drop-target");
  return classes.join(" ");
}

function moveValue<T extends string>(items: T[], source: T, target: T): T[];
function moveValue<T extends { id: string }>(items: T[], source: string, target: string): T[];
function moveValue<T extends string | { id: string }>(items: T[], source: string, target: string): T[] {
  const idFor = (item: T) => typeof item === "string" ? item : item.id;
  const sourceIndex = items.findIndex((item) => idFor(item) === source);
  const targetIndex = items.findIndex((item) => idFor(item) === target);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return items;
  const nextItems = [...items];
  const [sourceItem] = nextItems.splice(sourceIndex, 1);
  nextItems.splice(targetIndex, 0, sourceItem);
  return nextItems;
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
  const [draggedDomain, setDraggedDomain] = useState("");
  const [dropDomain, setDropDomain] = useState("");
  const [draggedErrorId, setDraggedErrorId] = useState("");
  const [dropErrorId, setDropErrorId] = useState("");
  const update = (id: string, patch: Partial<ErrorCode>) => onChange(rows.map((row) => row.id === id ? { ...row, ...patch } : row));
  const clearDomainDrag = () => {
    setDraggedDomain("");
    setDropDomain("");
  };
  const clearErrorDrag = () => {
    setDraggedErrorId("");
    setDropErrorId("");
  };
  const toggleDomain = (domain: string) => {
    setCollapsedDomains((current) => {
      const next = new Set(current);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };
  const groups = useMemo(() => {
    const groupsByDomain = new Map<string, ErrorCode[]>();
    for (const row of rows) {
      const domain = row.domain || "general";
      const groupRows = groupsByDomain.get(domain);
      if (groupRows) groupRows.push(row);
      else groupsByDomain.set(domain, [row]);
    }
    return Array.from(groupsByDomain, ([domain, groupRows]) => ({ domain, rows: groupRows }));
  }, [rows]);
  const moveDomain = (sourceDomain: string, targetDomain: string) => {
    if (!sourceDomain || sourceDomain === targetDomain) return;
    const domainOrder = groups.map((group) => group.domain);
    const nextDomainOrder = moveValue(domainOrder, sourceDomain, targetDomain);
    onChange(nextDomainOrder.flatMap((domain) => rows.filter((row) => (row.domain || "general") === domain)));
  };
  const moveError = (sourceId: string, targetId: string, domain: string) => {
    if (!sourceId || sourceId === targetId) return;
    const source = rows.find((row) => row.id === sourceId);
    const target = rows.find((row) => row.id === targetId);
    if (!source || !target || (source.domain || "general") !== domain || (target.domain || "general") !== domain) return;
    onChange(moveValue(rows, sourceId, targetId));
  };

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
          <div
            className={errorDomainClass(group.domain, draggedDomain, dropDomain)}
            key={group.domain}
            onDragOver={(event) => {
              if (!draggedDomain || draggedDomain === group.domain) return;
              event.preventDefault();
              setDropDomain(group.domain);
            }}
            onDragLeave={() => {
              if (dropDomain === group.domain) setDropDomain("");
            }}
            onDrop={(event) => {
              event.preventDefault();
              moveDomain(event.dataTransfer.getData("text/plain") || draggedDomain, group.domain);
              clearDomainDrag();
            }}
          >
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
                <span
                  className="drag-handle"
                  draggable
                  role="button"
                  tabIndex={0}
                  title="Drag to reorder domain"
                  aria-label="Drag to reorder domain"
                  onClick={(event) => event.stopPropagation()}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    setDraggedDomain(group.domain);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", group.domain);
                  }}
                  onDragEnd={clearDomainDrag}
                >
                  <GripVertical size={16} />
                </span>
                {collapsedDomains.has(group.domain) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                <span>{group.domain}</span>
                <small>{group.rows.length}</small>
              </div>
              <button type="button" onClick={(event) => { event.stopPropagation(); onAddErrorCode(group.domain); }}><Plus size={16} /> Add Error Code</button>
            </div>
            {!collapsedDomains.has(group.domain) && (
              <>
                <div className="table-header error-code-row">
                  <span />
                  <span>HTTP</span>
                  <span>Code</span>
                  <span>Description</span>
                  <span>Message EN</span>
                  <span>Description EN</span>
                  <span>Message TH</span>
                  <span>Description TH</span>
                  <span />
                </div>
                {group.rows.map((row) => (
                  <div
                    className={errorCodeRowClass(row.id, draggedErrorId, dropErrorId)}
                    key={row.id}
                    onDragOver={(event) => {
                      if (!draggedErrorId || draggedErrorId === row.id) return;
                      event.preventDefault();
                      setDropErrorId(row.id);
                    }}
                    onDragLeave={() => {
                      if (dropErrorId === row.id) setDropErrorId("");
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      moveError(event.dataTransfer.getData("text/plain") || draggedErrorId, row.id, group.domain);
                      clearErrorDrag();
                    }}
                  >
                    <span
                      className="drag-handle"
                      draggable
                      role="button"
                      tabIndex={0}
                      title="Drag to reorder error code"
                      aria-label="Drag to reorder error code"
                      onDragStart={(event) => {
                        event.stopPropagation();
                        setDraggedErrorId(row.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", row.id);
                      }}
                      onDragEnd={clearErrorDrag}
                    >
                      <GripVertical size={16} />
                    </span>
                    <input value={row.status} placeholder="400" onChange={(event) => update(row.id, { status: event.target.value })} />
                    <input value={row.code} placeholder="040001" onChange={(event) => update(row.id, { code: event.target.value })} />
                    <input value={row.description} placeholder="Short internal description" onChange={(event) => update(row.id, { description: event.target.value })} />
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
