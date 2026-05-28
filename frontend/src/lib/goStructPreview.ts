import type { FieldRow, ServiceSpec } from "../domain";

type StructNode = {
  jsonName: string;
  fieldName: string;
  type: string;
  isArray: boolean;
  children: Map<string, StructNode>;
};

export function serviceGoStruct(spec: ServiceSpec) {
  return [
    sectionGoStruct("Request", spec.requestFields),
    sectionGoStruct("Response", spec.responseFields),
  ].filter(Boolean).join("\n\n");
}

function sectionGoStruct(rootName: string, fields: FieldRow[]) {
  const bodyFields = fields.filter((field) => field.location === "BODY");
  if (bodyFields.length === 0) return "";

  const root: StructNode = {
    jsonName: rootName,
    fieldName: rootName,
    type: "object",
    isArray: false,
    children: new Map(),
  };

  for (const field of bodyFields) addField(root, field);

  const emitted = new Set<string>();
  const structs: string[] = [];
  emitStruct(rootName, root, emitted, structs);
  return structs.join("\n\n");
}

function addField(root: StructNode, field: FieldRow) {
  const parts = field.field.split(".").filter(Boolean);
  let current = root;

  for (const [index, rawPart] of parts.entries()) {
    const isArray = rawPart.endsWith("[]");
    const jsonName = rawPart.replace(/\[\]$/, "");
    const isLeaf = index === parts.length - 1;
    const existing = current.children.get(jsonName);
    const child = existing ?? {
      jsonName,
      fieldName: goFieldName(jsonName),
      type: "",
      isArray,
      children: new Map<string, StructNode>(),
    };

    child.isArray ||= isArray;
    if (isLeaf) child.type = normalizedType(field.type);
    else if (!child.type) child.type = "object";

    current.children.set(jsonName, child);
    current = child;
  }
}

function emitStruct(name: string, node: StructNode, emitted: Set<string>, structs: string[]) {
  if (!emitted.has(name)) {
    emitted.add(name);
    const lines = [`type ${name} struct {`];
    for (const child of node.children.values()) {
      lines.push(`\t${child.fieldName} ${goType(name, child)} \`json:"${child.jsonName}"\``);
    }
    lines.push("}");
    structs.push(lines.join("\n"));
  }

  for (const child of node.children.values()) {
    if (child.children.size === 0) continue;
    emitStruct(childStructName(name, child), child, emitted, structs);
  }
}

function goType(parentName: string, node: StructNode) {
  const type = node.children.size > 0 || node.type === "object"
    ? childStructName(parentName, node)
    : primitiveGoType(node.type);
  return node.isArray ? `[]${type}` : type;
}

function childStructName(parentName: string, node: StructNode) {
  return `${parentName}${node.fieldName}`;
}

function primitiveGoType(type: string) {
  const value = type.toLowerCase().trim().replace(/^array of /, "");
  if (value.includes("bool")) return "bool";
  if (value.includes("int")) return "int";
  if (value.includes("float") || value.includes("decimal") || value.includes("number")) return "float64";
  if (value.includes("object")) return "map[string]any";
  return "string";
}

function normalizedType(type: string) {
  const value = type.toLowerCase().trim();
  return value.startsWith("array of ") ? value.replace(/^array of /, "") : value;
}

function goFieldName(value: string) {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  const name = words.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join("");
  return /^[0-9]/.test(name) ? `Field${name}` : name || "Field";
}
