export type RequireFlag = "YES" | "NO";
export type RequestLocation = "HEADER" | "PATH PARAM" | "QUERY PARAM" | "BODY";
export type ResponseLocation = "HEADER" | "BODY";

export type FieldRow = {
  id: string;
  location: RequestLocation | ResponseLocation;
  field: string;
  type: string;
  require: RequireFlag;
  description: string;
};
