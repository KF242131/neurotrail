import { promises as fs } from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { generateReplayHtmlReport } from "../src/lib/exportHtml";
import {
  generateHandoffPacket,
  type NextAgentTarget,
} from "../src/lib/handoffPacket";
import { createTranslator, resolveLocale, type LocaleId } from "../src/lib/i18n";
import { redactJson, redactText } from "../src/lib/redaction";
import type {
  AgentTelemetry,
  NeuroEdgeData,
  NeuroSignal,
  PositionedNeuroNode,
} from "../src/types";

const MAX_BODY_BYTES = 8_000_000;

type ExportGraph = {
  id?: string;
  name?: string;
  sessionId?: string;
  nodes?: PositionedNeuroNode[];
  edges?: NeuroEdgeData[];
  signals?: NeuroSignal[];
  agents?: AgentTelemetry[];
};

type ExportRequestBody = {
  graph?: ExportGraph;
  targetAgent?: NextAgentTarget;
  redact?: boolean;
  locale?: LocaleId | string;
};

type ExportResult = {
  htmlReportPath: string;
  handoffPath: string;
  createdAt: string;
  sessionId: string;
  redacted: boolean;
};

function isLocalRequest(req: IncomingMessage) {
  const remote = req.socket.remoteAddress;
  return (
    !remote ||
    remote === "127.0.0.1" ||
    remote === "::1" ||
    remote === "::ffff:127.0.0.1"
  );
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("Report export payload is too large.");
    }
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  return JSON.parse(text) as ExportRequestBody;
}

function timestampSlug(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export async function writeReportFiles(
  cwd: string,
  input: {
    graph: Required<Pick<ExportGraph, "nodes" | "edges" | "signals">> &
      ExportGraph;
    targetAgent?: NextAgentTarget;
    redact?: boolean;
    locale?: LocaleId | string;
  }
): Promise<ExportResult> {
  const createdAt = new Date();
  const createdAtIso = createdAt.toISOString();
  const redacted = !!input.redact;
  const sessionId = input.graph.sessionId ?? input.graph.id ?? "local-session";
  const graph = redacted ? redactJson(input.graph) : input.graph;
  const targetAgent = input.targetAgent ?? "codex";
  const locale = resolveLocale(input.locale);
  const t = createTranslator(locale);
  const handoff = generateHandoffPacket({
    nodes: graph.nodes,
    edges: graph.edges,
    signals: graph.signals,
    agents: graph.agents ?? [],
    targetAgent,
    locale,
  });
  const redactionNotice = redacted
    ? t("report.redactionOn")
    : t("report.redactionOff");
  const handoffMarkdown = `${handoff.promptForNextAgent}\n\n---\n${redactionNotice}\n`;
  const html = generateReplayHtmlReport({
    title: graph.name ?? "NeuroTrail report",
    timestamp: createdAtIso,
    agents: graph.agents ?? [],
    nodes: graph.nodes,
    edges: graph.edges,
    signals: graph.signals,
    handoff,
    redactionNotice,
    locale,
  });

  const finalHtml = redacted ? redactText(html) : html;
  const finalHandoff = redacted ? redactText(handoffMarkdown) : handoffMarkdown;
  const root = path.join(cwd, ".neurotrail");
  const reportsDir = path.join(root, "reports");
  const handoffDir = path.join(root, "handoff");
  await fs.mkdir(reportsDir, { recursive: true });
  await fs.mkdir(handoffDir, { recursive: true });

  const reportPath = path.join(
    reportsDir,
    `${timestampSlug(createdAt)}-neurotrail-report.html`
  );
  const latestReportPath = path.join(reportsDir, "latest.html");
  const handoffPath = path.join(handoffDir, "latest.md");

  await Promise.all([
    fs.writeFile(reportPath, finalHtml, "utf8"),
    fs.writeFile(latestReportPath, finalHtml, "utf8"),
    fs.writeFile(handoffPath, finalHandoff, "utf8"),
  ]);

  return {
    htmlReportPath: latestReportPath,
    handoffPath,
    createdAt: createdAtIso,
    sessionId,
    redacted,
  };
}

export async function handleReportExportRequest(
  req: IncomingMessage,
  res: ServerResponse,
  cwd: string
) {
  if (!req.url?.startsWith("/api/report/export")) return false;

  if (!isLocalRequest(req)) {
    sendJson(res, 403, { error: "Report export is only exposed to localhost." });
    return true;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Use POST for report export." });
    return true;
  }

  try {
    const body = await readJsonBody(req);
    const graph = body.graph;
    if (!graph?.nodes?.length || !graph.edges || !graph.signals) {
      sendJson(res, 400, { error: "Missing graph nodes, edges, or signals." });
      return true;
    }
    const result = await writeReportFiles(cwd, {
      graph: {
        ...graph,
        nodes: graph.nodes,
        edges: graph.edges,
        signals: graph.signals,
      },
      targetAgent: body.targetAgent,
      redact: body.redact,
      locale: body.locale,
    });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to export report",
    });
  }
  return true;
}
