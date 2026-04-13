const DEFAULT_BASE_URL = "http://192.168.50.2:8080";

function getArgumentValue(name) {
  if (typeof $argument === "object" && $argument !== null) {
    const value = $argument[name];
    return typeof value === "string" ? value.trim() : "";
  }

  if (typeof $argument !== "string" || !$argument) {
    return "";
  }

  const rawArgument = $argument.trim().replace(/^\[|\]$/g, "");
  if (!rawArgument) {
    return "";
  }

  return name === "localBaseUrl" ? rawArgument : "";
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function appendTimestamp(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${Date.now()}`;
}

function mapRawGithubUrlToLocalPath(url, prefix) {
  const suffix = url.slice(prefix.length);
  const segments = suffix.split("/");

  if (segments.length < 4) {
    return "";
  }

  const [, repo, , ...pathSegments] = segments;

  if (!repo || pathSegments.length === 0) {
    return "";
  }

  return `${repo}/${pathSegments.join("/")}`;
}

const requestUrl = $request.url;
const localBaseUrl = trimTrailingSlash(getArgumentValue("localBaseUrl") || DEFAULT_BASE_URL);
const requestPrefix = "https://raw.githubusercontent.com/";

if (!requestUrl.startsWith(requestPrefix)) {
  $done({});
} else {
  const mappedPath = mapRawGithubUrlToLocalPath(requestUrl, requestPrefix);

  if (!mappedPath) {
    $done({});
  } else {
    const redirectUrl = appendTimestamp(`${localBaseUrl}/${mappedPath}`);

    $done({
      response: {
        status: 307,
        headers: {
          Location: redirectUrl
        }
      }
    });
  }
}
