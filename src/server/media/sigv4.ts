import { createHash, createHmac } from "node:crypto";

// AWS Signature Version 4, query-string form ("presigned URL"), as S3-compatible
// storage expects it. Pure: the result depends only on the arguments, which is what
// lets it be tested against AWS's published example without any account.

const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();
const sha256 = (data: string) => createHash("sha256").update(data).digest("hex");
// RFC 3986: everything except unreserved characters is percent-encoded.
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export type Presign = {
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  // Without scheme, e.g. "bucket.s3.amazonaws.com".
  host: string;
  // Starts with "/", not yet encoded.
  path: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresSec: number;
  now: Date;
};

export function presignUrl({ method, host, path, region, accessKeyId, secretAccessKey, expiresSec, now }: Presign): string {
  const timestamp = now.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const date = timestamp.slice(0, 8);
  const scope = `${date}/${region}/s3/aws4_request`;
  const canonicalPath = path.split("/").map(encode).join("/");
  const query = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${accessKeyId}/${scope}`],
    ["X-Amz-Date", timestamp],
    ["X-Amz-Expires", String(expiresSec)],
    ["X-Amz-SignedHeaders", "host"],
  ]
    .map(([key, value]) => `${key}=${encode(value)}`)
    .join("&");

  const canonicalRequest = [method, canonicalPath, query, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", timestamp, scope, sha256(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, date), region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return `https://${host}${canonicalPath}?${query}&X-Amz-Signature=${signature}`;
}
