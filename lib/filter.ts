import { UrlConfig } from "./types.d.ts";

export default function filter(headers: Headers, json: any, config: UrlConfig): string | null {
    const event = headers.get("x-github-event");
    const login: string | undefined = json.sender?.login?.toLowerCase();
    if (
        login &&
        ["coveralls[bot]", "netlify[bot]", "pre-commit-ci[bot]"].some((n) => login.includes(n))
    ) {
        return "bot";
    }

    const refMatch = /^refs\/([^\/]+)\/(.+)$/.exec(json.ref);
    if (event === "push" && refMatch) {
        // check if branch is allowed
        if (
            refMatch[0] == "heads" && config.allowBranches !== undefined &&
            !config.allowBranches.includes(refMatch[1])
        ) {
            return `branch '${refMatch[1]}' not in ${JSON.stringify(config.allowBranches)}`;
        }

        // check if it's a tag
        if (refMatch[0] == "tags" && config.hideTags === true) {
            return "tag";
        }
    }

    return null;
}