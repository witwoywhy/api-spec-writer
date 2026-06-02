export type DbColumnConstraint = "NONE" | "PRIMARY KEY" | "UNIQUE" | "FOREIGN KEY" | "CHECK" | "DEFAULT" | "INDEX";
export type DbColumnNullable = "YES" | "NO";

export type DbColumn = {
  id: string;
  field: string;
  type: string;
  nullable: DbColumnNullable;
  constraint: DbColumnConstraint;
  description: string;
};

export type DbIndex = {
  id: string;
  name: string;
  columnIds: string[];
  type: "BTREE" | "HASH" | "GIN" | "GIST" | "BRIN";
  unique: "YES" | "NO";
};

export type DbTable = {
  id: string;
  name: string;
  columns: DbColumn[];
  indexes: DbIndex[];
};
