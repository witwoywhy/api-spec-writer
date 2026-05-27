import type { ErrorCode, ServiceSpec } from "../domain";
import { uid } from "./id";

const DEFAULT_ERROR_CODES: Array<{ status: string; code: string; message: string }> = [
  { status: "300", code: "3000300", message: "Multiple Choices" },
  { status: "301", code: "3000301", message: "Moved Permanently" },
  { status: "302", code: "3000302", message: "Found" },
  { status: "303", code: "3000303", message: "See Other" },
  { status: "304", code: "3000304", message: "Not Modified" },
  { status: "305", code: "3000305", message: "Use Proxy" },
  { status: "306", code: "3000306", message: "(Unused)" },
  { status: "307", code: "3000307", message: "Temporary Redirect" },
  { status: "308", code: "3000308", message: "Permanent Redirect" },
  { status: "400", code: "4000400", message: "Bad Request" },
  { status: "401", code: "4000401", message: "Unauthorized" },
  { status: "402", code: "4000402", message: "Payment Required" },
  { status: "403", code: "4000403", message: "Forbidden" },
  { status: "404", code: "4000404", message: "Not Found" },
  { status: "405", code: "4000405", message: "Method Not Allowed" },
  { status: "406", code: "4000406", message: "Not Acceptable" },
  { status: "407", code: "4000407", message: "Proxy Authentication Required" },
  { status: "408", code: "4000408", message: "Request Timeout" },
  { status: "409", code: "4000409", message: "Conflict" },
  { status: "410", code: "4000410", message: "Gone" },
  { status: "411", code: "4000411", message: "Length Required" },
  { status: "412", code: "4000412", message: "Precondition Failed" },
  { status: "413", code: "4000413", message: "Content Too Large" },
  { status: "414", code: "4000414", message: "URI Too Long" },
  { status: "415", code: "4000415", message: "Unsupported Media Type" },
  { status: "416", code: "4000416", message: "Range Not Satisfiable" },
  { status: "417", code: "4000417", message: "Expectation Failed" },
  { status: "418", code: "4000418", message: "(Unused)" },
  { status: "421", code: "4000421", message: "Misdirected Request" },
  { status: "422", code: "4000422", message: "Unprocessable Content" },
  { status: "423", code: "4000423", message: "Locked" },
  { status: "424", code: "4000424", message: "Failed Dependency" },
  { status: "425", code: "4000425", message: "Too Early" },
  { status: "426", code: "4000426", message: "Upgrade Required" },
  { status: "428", code: "4000428", message: "Precondition Required" },
  { status: "429", code: "4000429", message: "Too Many Requests" },
  { status: "431", code: "4000431", message: "Request Header Fields Too Large" },
  { status: "451", code: "4000451", message: "Unavailable For Legal Reasons" },
  { status: "500", code: "5000500", message: "Internal Server Error" },
  { status: "501", code: "5000501", message: "Not Implemented" },
  { status: "502", code: "5000502", message: "Bad Gateway" },
  { status: "503", code: "5000503", message: "Service Unavailable" },
  { status: "504", code: "5000504", message: "Gateway Timeout" },
  { status: "505", code: "5000505", message: "HTTP Version Not Supported" },
  { status: "506", code: "5000506", message: "Variant Also Negotiates" },
  { status: "507", code: "5000507", message: "Insufficient Storage" },
  { status: "508", code: "5000508", message: "Loop Detected" },
  { status: "510", code: "5000510", message: "Not Extended" },
  { status: "511", code: "5000511", message: "Network Authentication Required" },
  { status: "500", code: "5009001", message: "(CUSTOM) Internal Integration Server Error" },
];

export function createDefaultErrorCodes(): ErrorCode[] {
  return DEFAULT_ERROR_CODES.map((errorCode) => ({
    id: uid(),
    domain: "General",
    status: errorCode.status,
    code: errorCode.code,
    message_th: "",
    description_th: "",
    message_en: errorCode.message,
    description_en: "",
  }));
}

export function createDefaultSpec(name = "Create Transaction"): ServiceSpec {
  return {
    name,
    type: "http",
    method: "POST",
    url: "/v1/transactions",
    authentication: "Bearer access token",
    description: "Create a transaction verification request and return the generated transaction ID.",
    requestExample: '{\n  "type": "INTERBANK",\n  "from_account": "1234567890",\n  "to_account": "0987654321",\n  "amount": 500.00\n}',
    requestExamples: [
      {
        id: uid(),
        name: "Interbank",
        value: '{\n  "type": "INTERBANK",\n  "from_account": "1234567890",\n  "to_account": "0987654321",\n  "amount": 500.00\n}',
      },
    ],
    requestFields: [
      { id: uid(), location: "BODY", field: "type", type: "string", require: "YES", description: "Enum: INTERBANK, INTRABANK" },
      { id: uid(), location: "BODY", field: "from_account", type: "string", require: "YES", description: "Source account number" },
      { id: uid(), location: "BODY", field: "to_account", type: "string", require: "YES", description: "Destination account number" },
      { id: uid(), location: "BODY", field: "amount", type: "number", require: "YES", description: "Must be greater than 0" },
    ],
    sequence: "sequenceDiagram\n    participant request\n    participant service\n    participant db.transaction\n\n    request ->> service: POST /v1/transactions\n    service ->> db.transaction: insert transaction\n    db.transaction -->> service: response\n    service -->> request: response",
    errors: [
      { id: uid(), domain: "general", status: "400", code: "040001", message_th: "", description_th: "", message_en: "invalid request", description_en: "Request validation fails" },
      { id: uid(), domain: "general", status: "401", code: "040002", message_th: "", description_th: "", message_en: "unauthorized", description_en: "Token is missing or invalid" },
    ],
    responseExample: '{\n  "transaction_id": "a7d5e8ac-3d7c-4a9e-95c1-9129998a7c10"\n}',
    responseExamples: [
      {
        id: uid(),
        name: "Success",
        status: "200",
        value: '{\n  "transaction_id": "a7d5e8ac-3d7c-4a9e-95c1-9129998a7c10"\n}',
      },
    ],
    responseFields: [
      { id: uid(), location: "BODY", field: "transaction_id", type: "string", require: "YES", description: "Generated transaction UUID" },
    ],
    mappingSections: [
      {
        id: uid(),
        name: "Insert Transaction",
        rows: [
          { id: uid(), target: "id", from: "", description: "Generate new UUID" },
          { id: uid(), target: "type", from: "request.type", description: "" },
          { id: uid(), target: "from_account", from: "request.from_account", description: "" },
          { id: uid(), target: "to_account", from: "request.to_account", description: "" },
          { id: uid(), target: "amount", from: "request.amount", description: "" },
        ],
      },
    ],
  };
}
