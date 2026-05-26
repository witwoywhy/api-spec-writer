import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";

export function Fieldset({ title, children }: { title: string; children: ReactNode }) {
  return <section className="fieldset"><h3>{title}</h3>{children}</section>;
}

export function Label({ text, wide, children }: { text: string; wide?: boolean; children: ReactNode }) {
  return <label className={wide ? "wide-label" : ""}><span>{text}</span>{children}</label>;
}

export function IconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button className="icon-button" type="button" aria-label={label} title={label} onClick={onClick}><Trash2 size={16} /></button>;
}
