export type MappingRow = {
  id: string;
  target: string;
  from: string;
  description: string;
};

export type MappingSection = {
  id: string;
  name: string;
  rows: MappingRow[];
};
