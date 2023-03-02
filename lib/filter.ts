import { commentManager } from "./manager.ts";
import { UrlConfig } from "./types.d.ts";
import { requestLog, wildcardMatch } from "./util.ts";

export default async function filter(
    headers: Headers,
    json: any,
    config: UrlConfig,
): Promise<string | null> {
    const reqLog = requestLog(headers);
    const event = headers.get("x-github-event") || "unknown";
    const login: string | undefined = json.sender?.login?.toLowerCase();

    // ignore events that Discord won't render anyway
    if (["status", "pull_request_review_thread"].includes(event)) {
        return event;
    }

    // ignore all PR actions except "opened", "closed", "reopened"
    if (
        event === "pull_request" && json.action &&
        !["opened", "closed", "reopened"].includes(json.action)
    ) {
        return `no-op PR action '${json.action}'`;
    }

    // ignore all issue actions except "opened", "deleted", "closed", "reopened", "transferred"
    if (
        event === "issues" && json.action &&
        !["opened", "deleted", "closed", "reopened", "transferred"].includes(json.action)
    ) {
        return `no-op issue action '${json.action}'`;
    }

    // ignore some PR review actions
    if (event === "pull_request_review") {
        // ignore edit/dismiss actions
        if (json.action !== "submitted") return `no-op PR review action '${json.action}'`;

        // if comment (not approval or changes requested), ignore empty review body
        if (json.review?.state === "commented" && !json.review?.body) return "empty PR review";
    }

    // ignore some PR comment events
    if (event === "pull_request_review_comment") {
        // ignore edit/delete actions
        if (json.action !== "created") return `no-op PR comment action '${json.action}'`;

        // check if more than x comments on a PR review in a short timespan
        const reviewId: number = json.comment?.pull_request_review_id;
        if (config.commentBurstLimit && reviewId) {
            const cacheKey = `${reviewId}-${login}`;

            reqLog.debug(`filter: checking cache key ${cacheKey}`);
            const curr = await commentManager.getAndIncrement(cacheKey);
            reqLog.debug(`filter: current value: ${curr}`);

            if (curr && curr >= config.commentBurstLimit) {
                return `exceeded comment burst limit (${config.commentBurstLimit}) for review ${reviewId}`;
            }
        }
    }

    // ignore bots
    if (
        login &&
        ["coveralls[bot]", "netlify[bot]", "pre-commit-ci[bot]"].some((n) => login.includes(n))
    ) {
        return "bot";
    }

    let refType: "branch" | "tag" | undefined;
    let ref: string | undefined;
    if (event === "push") {
        // ignore branch/tag push
        const refMatch = /^refs\/([^\/]+)\/(.+)$/.exec(json.ref);
        if (refMatch) {
            refType = refMatch[1] === "heads"
                ? "branch"
                : (refMatch[1] == "tags" ? "tag" : undefined);
            ref = refMatch[2];
        }
    } else if (["create", "delete"].includes(event)) {
        // ignore creation/deletion of branch/tag
        refType = json.ref_type;
        ref = json.ref;
    }

    // if we have a `push` event for a tag, it will either not show up at all (create/delete),
    // or will show up incorrectly (update).
    // just ignore it, since tag creation/deletion also sends a separate (actually usable) event
    if (event === "push" && refType === "tag") {
        return `tag '${ref}' pushed`;
    }

    if (refType && ref) {
        if (
            refType == "branch" && config.allowBranches !== undefined &&
            !wildcardMatch(config.allowBranches, ref)
        ) {
            return `branch '${ref}' does not match ${JSON.stringify(config.allowBranches)}`;
        }
        if (refType == "tag" && config.hideTags === true) {
            return `tag '${ref}'`;
        }
    }

    return null;
}
