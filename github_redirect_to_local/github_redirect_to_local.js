const DEFAULT_BASE_URL = "http://192.168.50.2:8080";
const DEFAULT_REPOSITORY = "Proxy.Modules";

function normalizeArgumentValue(value) {
    return typeof value === "string" ? value.trim() : "";
}

function parseArgumentString(argument) {
    const rawArgument = argument.trim().replace(/^\[|\]$/g, "");

    if (!rawArgument) {
        return {};
    }

    const tokens = rawArgument
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    const positionalNames = ["localBaseUrl", "repository"];
    const parsedArguments = {};

    positionalNames.forEach((name, index) => {
        parsedArguments[name] = tokens[index] || "";
    });

    return parsedArguments;
}

function getArgumentValue(name) {
    if (typeof $argument === "object" && $argument !== null) {
        return normalizeArgumentValue($argument[name]);
    }

    if (typeof $argument !== "string" || !$argument) {
        return "";
    }

    const parsedArguments = parseArgumentString($argument);
    return normalizeArgumentValue(parsedArguments[name]);
}

function trimTrailingSlash(value) {
    return value.replace(/\/+$/, "");
}

function appendTimestamp(url) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}t=${Date.now()}`;
}

function mapRawGithubUrlToLocalPath(url, prefix, repository) {
    const suffix = url.slice(prefix.length);
    const segments = suffix.split("/");

    if (segments.length < 4) {
        return "";
    }

    const [, repo, , ...pathSegments] = segments;

    if (!repo || pathSegments.length === 0) {
        return "";
    }

    if (repository && repo !== repository) {
        return "";
    }

    return `${repo}/${pathSegments.join("/")}`;
}

const requestUrl = $request.url;
const localBaseUrl = trimTrailingSlash(getArgumentValue("localBaseUrl") || DEFAULT_BASE_URL);
const repository = getArgumentValue("repository") || DEFAULT_REPOSITORY;
const requestPrefix = "https://raw.githubusercontent.com/";

if (!requestUrl.startsWith(requestPrefix)) {
    $done({});
} else {
    const mappedPath = mapRawGithubUrlToLocalPath(requestUrl, requestPrefix, repository);

    if (!mappedPath) {
        $done({});
    } else {
        const redirectUrl = appendTimestamp(`${localBaseUrl}/${mappedPath}`);

        $done({
            response: {
                status: 307,
                headers: {
                    Location: redirectUrl,
                },
            },
        });
    }
}
