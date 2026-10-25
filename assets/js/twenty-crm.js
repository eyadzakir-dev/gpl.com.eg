// Twenty CRM helpers for website forms: webhook create (no files) or
// GraphQL upload + REST create + Attachment rows (files stored in Twenty).
// Requires a create/upload-scoped API key in data-crm-api-key when files are present.
// Never put a full admin key in static HTML.

const CRM_BASE_DEFAULT = "https://crm.tsf.com.eg";
// Attachment.file FILES field on this workspace (Settings → Data model).
const ATTACHMENT_FILE_FIELD_ID = "96ea69f7-4808-412d-86a8-ecce49c4f049";
const CRM_TIMEOUT_MS = 60000;

const CREATE_FILE_UPLOAD = `
  mutation CreateFileUpload($filename: String!, $size: Float!, $fileFolder: FileFolder!, $fieldMetadataId: String) {
    createFileUpload(filename: $filename, size: $size, fileFolder: $fileFolder, fieldMetadataId: $fieldMetadataId) {
      fileId
      uploadUrl
      contentType
    }
  }
`;

const COMPLETE_FILE_UPLOAD = `
  mutation CompleteFileUpload($fileId: String!) {
    completeFileUpload(fileId: $fileId) { id }
  }
`;

function trimText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function getCrmConfig(form) {
  const fromWindow = typeof window !== "undefined" ? trimText(window.TWENTY_CRM_API_KEY) : "";
  return {
    webhook: trimText(form.dataset.crmEndpoint),
    apiKey: trimText(form.dataset.crmApiKey) || fromWindow,
    apiBase: (trimText(form.dataset.crmApiBase) || CRM_BASE_DEFAULT).replace(/\/$/, ""),
  };
}

function authHeaders(apiKey, json = true) {
  const headers = { Accept: "application/json", Authorization: `Bearer ${apiKey}` };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

async function withTimeout(work, ms = CRM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function metadataGql(apiBase, apiKey, query, variables) {
  return withTimeout(async (signal) => {
    const response = await fetch(`${apiBase}/metadata`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({ query, variables }),
      signal,
    });
    if (!response.ok) throw new Error(`Twenty metadata responded with ${response.status}.`);
    const json = await response.json();
    if (json.errors?.length) throw new Error(json.errors[0].message || "Twenty metadata error.");
    return json.data;
  });
}

async function restPost(apiBase, apiKey, path, body) {
  return withTimeout(async (signal) => {
    const response = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) throw new Error(`Twenty REST ${path} responded with ${response.status}.`);
    return response.json().catch(() => ({}));
  });
}

function fileCategoryFor(name) {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  if (["pdf", "doc", "docx", "txt", "rtf"].includes(ext)) return "TEXT_DOCUMENT";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "IMAGE";
  if (["xls", "xlsx", "csv"].includes(ext)) return "SPREADSHEET";
  if (["zip", "rar", "7z"].includes(ext)) return "ARCHIVE";
  if (["ppt", "pptx"].includes(ext)) return "PRESENTATION";
  return "OTHER";
}

/** Upload one browser File into Twenty storage; returns { fileId, label }. */
export async function uploadFileToTwenty(apiBase, apiKey, file) {
  const data = await metadataGql(apiBase, apiKey, CREATE_FILE_UPLOAD, {
    filename: file.name,
    size: file.size,
    fileFolder: "FilesField",
    fieldMetadataId: ATTACHMENT_FILE_FIELD_ID,
  });
  const target = data?.createFileUpload;
  if (!target?.fileId || !target?.uploadUrl) throw new Error("Twenty createFileUpload returned no upload target.");

  await withTimeout(async (signal) => {
    const put = await fetch(target.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": target.contentType || file.type || "application/octet-stream" },
      body: file,
      signal,
    });
    if (!put.ok) throw new Error(`Twenty file PUT responded with ${put.status}.`);
  });

  const done = await metadataGql(apiBase, apiKey, COMPLETE_FILE_UPLOAD, { fileId: target.fileId });
  if (!done?.completeFileUpload?.id) throw new Error("Twenty completeFileUpload failed.");
  return { fileId: target.fileId, label: file.name };
}

function extractCreatedId(json, keys) {
  if (typeof json?.id === "string") return json.id;
  if (typeof json?.data?.id === "string") return json.data.id;
  for (const key of keys) {
    const id = json?.data?.[key]?.id;
    if (typeof id === "string") return id;
  }
  return "";
}

export async function createWebInquiryRecord(apiBase, apiKey, payload) {
  const body = {
    name: payload.name || "Website submission",
    formType: payload.formType,
    sourceSite: payload.sourceSite,
    status: "NEW",
    email: { primaryEmail: payload.email, additionalEmails: null },
  };
  if (payload.phone) {
    body.phone = {
      primaryPhoneNumber: payload.phone,
      primaryPhoneCountryCode: null,
      primaryPhoneCallingCode: null,
      additionalPhones: null,
    };
  }
  if (payload.company) body.company = payload.company;
  if (payload.message) body.message = payload.message;
  if (payload.product) body.product = payload.product;
  if (payload.quantity) body.quantity = payload.quantity;
  if (payload.market) body.market = payload.market;
  if (payload.careerRole) body.careerRole = payload.careerRole;
  if (payload.roleTitle) body.roleTitle = payload.roleTitle;
  if (payload.freightMode) body.freightMode = payload.freightMode;
  if (payload.routeSummary) body.routeSummary = payload.routeSummary;
  if (payload.cargoSummary) body.cargoSummary = payload.cargoSummary;
  if (payload.submittedAt) body.submittedAt = payload.submittedAt;
  if (payload.sourceLogoUrl) {
    body.sourceLogo = { primaryLinkUrl: payload.sourceLogoUrl, primaryLinkLabel: "Source logo", secondaryLinks: null };
  }
  if (payload.sourcePageUrl) {
    body.sourcePage = { primaryLinkUrl: payload.sourcePageUrl, primaryLinkLabel: "Source page", secondaryLinks: null };
  }

  const json = await restPost(apiBase, apiKey, "/rest/webInquiries", body);
  const id = extractCreatedId(json, ["createWebInquiry", "webInquiry"]);
  if (!id) throw new Error("Twenty create webInquiry returned no id.");
  return { id };
}

export async function attachFilesToWebInquiry(apiBase, apiKey, webInquiryId, uploaded) {
  for (const item of uploaded) {
    await restPost(apiBase, apiKey, "/rest/attachments", {
      name: item.label,
      fileCategory: fileCategoryFor(item.label),
      targetWebInquiryId: webInquiryId,
      file: [{ fileId: item.fileId, label: item.label }],
    });
  }
}

async function postWebhook(endpoint, payload) {
  return withTimeout(async (signal) => {
    const response = await fetch(endpoint, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      signal,
    });
    if (!response.ok) throw new Error(`CRM webhook responded with ${response.status}.`);
    return true;
  }, 15000);
}

/**
 * Submit CRM side of a website form.
 * - No files: webhook (preferred) or REST create when only an API key is set.
 * - With files: upload to Twenty storage, REST-create Web Inquiry, create Attachment rows.
 *   Needs data-crm-api-key (restricted create/upload role). Does not use Fabrik URLs.
 */
export async function submitToTwentyCrm(form, { payload, files = [] }) {
  const cfg = getCrmConfig(form);
  if (!cfg.webhook && !cfg.apiKey) return null;

  if (files.length) {
    if (!cfg.apiKey) {
      console.warn("CRM attachments need data-crm-api-key (restricted Twenty role). Falling back to webhook without files.");
      if (!cfg.webhook) throw new Error("CRM API key is required to upload files.");
      return postWebhook(cfg.webhook, payload);
    }
    const uploaded = [];
    for (const file of files) uploaded.push(await uploadFileToTwenty(cfg.apiBase, cfg.apiKey, file));
    const created = await createWebInquiryRecord(cfg.apiBase, cfg.apiKey, payload);
    await attachFilesToWebInquiry(cfg.apiBase, cfg.apiKey, created.id, uploaded);
    return true;
  }

  if (cfg.webhook) return postWebhook(cfg.webhook, payload);
  await createWebInquiryRecord(cfg.apiBase, cfg.apiKey, payload);
  return true;
}
