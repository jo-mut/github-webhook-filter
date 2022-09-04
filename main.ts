import { http, log } from "./deps.ts";
import config from "./lib/config.ts";
import handler from "./lib/handler.ts";

async function setupLogs(): Promise<void> {
    await log.setup({
        handlers: {
            console: new log.handlers.ConsoleHandler("DEBUG", {
                formatter: (rec) => `${rec.datetime.toISOString()} [${rec.levelName}] ${rec.msg}`,
            }),
        },
        loggers: {
            default: {
                level: config.debug ? "DEBUG" : "INFO",
                handlers: ["console"],
            },
        },
    });
}

async function handleRequest(req: Request, connInfo: http.ConnInfo): Promise<Response> {
    let resp: Response;
    try {
        resp = await handler(req);
    } catch (err) {
        if (http.isHttpError(err) && err.expose) {
            log.warning(`http error: ${err.message}`);
            resp = new Response(err.message, { status: err.status });
        } else {
            log.critical(err);
            resp = new Response("Internal Server Error", { status: 500 });
        }
    }

    const respLen = resp.headers.get("content-length") || 0;
    const addr = connInfo.remoteAddr as Deno.NetAddr;
    log.info(
        `http: ${addr.hostname}:${addr.port} - ${req.method} ${req.url} ${resp.status} ${respLen}`,
    );

    return resp;
}

if (import.meta.main) {
    setupLogs();

    if (!config.signKey) {
        log.warning("url signing disabled");
    }

    log.info(`starting webserver on ${config.hostname}:${config.port}`);
    http.serve(handleRequest, {
        hostname: config.hostname,
        port: config.port,
    });
}
