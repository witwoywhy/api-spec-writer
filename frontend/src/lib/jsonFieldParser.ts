import type { FieldRow, RequestLocation, ResponseLocation } from "../domain";
import { uid } from "./id";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export function parseJsonFields(json: string, location: RequestLocation | ResponseLocation): FieldRow[] {
  const value = JSON.parse(json) as JsonValue;
  if (!isRecord(value)) return [];

  return Object.entries(value).flatMap(([key, child]) => parseField(key, child, location));
}

function parseField(path: string, value: JsonValue, location: RequestLocation | ResponseLocation): FieldRow[] {
  if (Array.isArray(value)) {
    const item = value[0];
    const arrayPath = `${path}[]`;
    if (isRecord(item)) {
      return [
        createField(arrayPath, "array of object", location),
        ...Object.entries(item).flatMap(([key, child]) => parseField(`${arrayPath}.${key}`, child, location)),
      ];
    }
    return [createField(arrayPath, `array of ${primitiveType(item)}`, location)];
  }

  if (isRecord(value)) {
    return [
      createField(path, "object", location),
      ...Object.entries(value).flatMap(([key, child]) => parseField(`${path}.${key}`, child, location)),
    ];
  }

  return [createField(path, primitiveType(value), location)];
}

function createField(field: string, type: string, location: RequestLocation | ResponseLocation): FieldRow {
  return {
    id: uid(),
    location,
    field,
    type,
    require: "YES",
    description: "",
  };
}

function primitiveType(value: JsonValue | undefined) {
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "float";
  if (typeof value === "string") return "string";
  if (value === null) return "null";
  if (value === undefined) return "unknown";
  return "object";
}

function isRecord(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
