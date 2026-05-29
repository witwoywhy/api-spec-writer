export type RequireFlag = "YES" | "NO";
export type RequestLocation = "BODY" | "HEADER" | "PATH PARAM" | "QUERY PARAM" | "FORM-DATA" | "X-WWW-FORM-URLENCODED";
export type ResponseLocation = "HEADER" | "BODY";

export type FieldRow = {
  id: string;
  location: RequestLocation | ResponseLocation;
  field: string;
  type: string;
  require: RequireFlag;
  description: string;
};
