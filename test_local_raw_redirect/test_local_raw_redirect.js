const DEFAULT_BASE_URL = "http://192.168.50.2";

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

const requestUrl = $request.url;
const localBaseUrl = trimTrailingSlash(getArgumentValue("localBaseUrl") || DEFAULT_BASE_URL);
const requestPrefix = "https://raw.githubusercontent.com/";

if (!requestUrl.startsWith(requestPrefix)) {
  $done({});
} else {
  const suffix = requestUrl.slice(requestPrefix.length);
  const redirectUrl = `${localBaseUrl}/${suffix}`;

  $done({
    response: {
      status: 307,
      headers: {
        Location: redirectUrl
      }
    }
  });
}
