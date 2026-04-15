const $ = new Env("代理工具兼容性测试");
const TEST_PAGE_URL = "https://m.163.com";
const STORAGE_TEST_KEY = "proxy_tools_compatibility_test.storage_probe";

const ENVIRONMENT_DETECTORS = [
  { name: "Quantumult X", detect: () => typeof $task !== "undefined" },
  { name: "Loon", detect: () => typeof $loon !== "undefined" },
  { name: "Surge", detect: () => typeof $environment !== "undefined" && Boolean($environment["surge-version"]) },
  { name: "Stash", detect: () => typeof $environment !== "undefined" && Boolean($environment["stash-version"]) },
  { name: "Egern", detect: () => typeof Egern !== "undefined" },
  { name: "Shadowrocket", detect: () => typeof $rocket !== "undefined" }
];

const PROXY_ENVIRONMENT_VARIABLES = [
  {
    name: "Egern",
    exists: () => typeof Egern !== "undefined",
    value: () => Egern
  },
  {
    name: "$environment",
    exists: () => typeof $environment !== "undefined",
    value: () => $environment
  },
  {
    name: "$task",
    exists: () => typeof $task !== "undefined",
    value: () => $task
  },
  {
    name: "$loon",
    exists: () => typeof $loon !== "undefined",
    value: () => $loon
  },
  {
    name: "$rocket",
    exists: () => typeof $rocket !== "undefined",
    value: () => $rocket
  }
];

const hasFunction = (value) => typeof value === "function";
const hasObject = (value) => value !== null && typeof value === "object";
const hasFields = (value) => value !== null && (typeof value === "object" || typeof value === "function");
const truncate = (value, maxLength = 100) => {
  const text = String(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const stringify = (value) => {
  if (typeof value === "undefined") return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value;

  try {
    const json = JSON.stringify(value);
    return typeof json === "undefined" ? String(value) : json;
  } catch (error) {
    return String(value);
  }
};

const stringifyFieldValue = (key, value, options = {}) => {
  const maxLength = options.maxLength || (key === "body" ? 100 : 0);
  const text = typeof value === "string" ? value : stringify(value);

  if (maxLength > 0 && text.length > maxLength) {
    return `${truncate(text, maxLength)} (truncated, total ${text.length} chars)`;
  }

  return text;
};

const describeObjectFields = (name, value, options = {}) => {
  if (!hasObject(value)) return `${name}: ${typeof value}`;

  const keys = Object.keys(value);
  if (keys.length === 0) return `${name}: {}`;

  return keys
    .map((key) => `${key}: ${stringifyFieldValue(key, value[key], options)}`)
    .join("\n\n");
};

const describeTypedObjectFields = (name, value, options = {}) => {
  if (!hasFields(value)) return `${name}: ${stringifyFieldValue(name, value, options)}`;

  const keys = Object.keys(value);
  if (keys.length === 0) return `${name} (${typeof value}): ${stringifyFieldValue(name, value, options)}`;

  return keys
    .map((key) => {
      const valueType = hasFunction(value[key]) ? "function" : typeof value[key];
      const valueText = hasFunction(value[key]) ? "function" : stringifyFieldValue(key, value[key], options);
      return `${key} (${valueType}): ${valueText}`;
    })
    .join("\n\n");
};

const formatAvailability = (items) => {
  const available = items.filter((item) => item.available).map((item) => item.name);
  const missing = items.filter((item) => !item.available).map((item) => item.name);

  return {
    hasAvailable: available.length > 0,
    detail: [
      `可用：${available.length ? available.join(", ") : "无"}`,
      `缺失：${missing.length ? missing.join(", ") : "无"}`
    ].join("\n\n")
  };
};

const getEnvironmentName = () => {
  const found = ENVIRONMENT_DETECTORS.find((item) => {
    try {
      return item.detect();
    } catch (error) {
      return false;
    }
  });

  if (found) return found.name;
  return "Unknown";
};

const getRequestUrl = () => {
  if (typeof $request !== "undefined" && typeof $request.url === "string") {
    return $request.url;
  }

  return "";
};

const isTestPageRequest = (url) => String(url || "").split("?")[0].replace(/\/+$/, "") === TEST_PAGE_URL;
const getResponseStatus = () => {
  if (typeof $response === "undefined" || !hasObject($response)) return "";
  return $response.status || $response.statusCode || "";
};

const getResponseBody = () => {
  if (typeof $response === "undefined" || !hasObject($response)) return undefined;
  return $response.body;
};

const pass = (detail) => ({ passed: true, detail });
const fail = (detail) => ({ passed: false, detail });

const readStorage = (key) => {
  if (typeof $persistentStore !== "undefined" && hasFunction($persistentStore.read)) {
    return $persistentStore.read(key);
  }

  if (typeof $prefs !== "undefined" && hasFunction($prefs.valueForKey)) {
    return $prefs.valueForKey(key);
  }

  return undefined;
};

const writeStorage = (key, value) => {
  if (typeof $persistentStore !== "undefined" && hasFunction($persistentStore.write)) {
    return $persistentStore.write(value, key);
  }

  if (typeof $prefs !== "undefined" && hasFunction($prefs.setValueForKey)) {
    return $prefs.setValueForKey(value, key);
  }

  return false;
};

const removeStorage = (key) => {
  if (typeof $persistentStore !== "undefined") {
    if (hasFunction($persistentStore["delete"])) return $persistentStore["delete"](key);
    if (hasFunction($persistentStore.remove)) return $persistentStore.remove(key);
  }

  if (typeof $prefs !== "undefined") {
    if (hasFunction($prefs.removeValueForKey)) return $prefs.removeValueForKey(key);
    if (hasFunction($prefs.remove)) return $prefs.remove(key);
  }

  return false;
};

const TEST_GROUPS = [
  {
    category: "运行环境",
    tests: [
      {
        name: "代理工具识别",
        run: () => {
          const environmentName = getEnvironmentName();
          return environmentName === "Unknown"
            ? fail("未识别到常见 iOS 代理工具全局变量")
            : pass(`当前环境：${environmentName}`);
        }
      },
      {
        name: "环境变量字段和值",
        run: () => {
          const sections = PROXY_ENVIRONMENT_VARIABLES.map((item) => {
            try {
              if (!item.exists()) return `[${item.name}]\n不存在`;
              return `[${item.name}]\n${describeTypedObjectFields(item.name, item.value(), { maxLength: 100 })}`;
            } catch (error) {
              return `[${item.name}]\n读取失败：${error && error.message ? error.message : String(error)}`;
            }
          });

          return pass(sections.join("\n\n"));
        }
      },
      {
        name: "$done 回调",
        run: () => hasFunction(typeof $done !== "undefined" ? $done : undefined)
          ? pass("$done 可用")
          : fail("$done 不存在或不是函数")
      }
    ]
  },
  {
    category: "请求上下文",
    tests: [
      {
        name: "$request 字段和值",
        run: () => {
          if (typeof $request === "undefined" || !hasObject($request)) {
            return fail("$request 不存在");
          }

          return pass(describeObjectFields("$request", $request));
        }
      }
    ]
  },
  {
    category: "响应上下文",
    tests: [
      {
        name: "$response 字段和值",
        run: () => {
          if (typeof $response === "undefined" || !hasObject($response)) {
            return fail("$response 不存在");
          }

          return pass(describeObjectFields("$response", $response));
        }
      }
    ]
  },
  {
    category: "响应体改写",
    tests: [
      {
        name: "Body 替换",
        run: () => {
          const qxMode = 'QX：请求阶段和响应阶段都使用 $done({ status: "HTTP/1.1 200 OK", headers, body })';
          const responseStage = "其他工具响应阶段：改写已有响应，使用 $done({ status: 200, headers, body })";
          const requestStage = "其他工具请求阶段：构造虚假响应，使用 $done({ response: { status: 200, headers, body } })";

          return hasFunction(typeof $done !== "undefined" ? $done : undefined)
            ? pass([qxMode, requestStage, responseStage].join("\n"))
            : fail("缺少 $done，无法替换响应体");
        }
      },
      {
        name: "Content-Type 响应头",
        run: () => {
          if (typeof $response !== "undefined" && hasObject($response.headers)) {
            const headerNames = Object.keys($response.headers);
            const contentTypeName = headerNames.find((name) => name.toLowerCase() === "content-type");
            if (contentTypeName) return pass(String($response.headers[contentTypeName]));
          }

          return pass("沿用原响应 Content-Type");
        }
      },
      {
        name: "状态码改写",
        run: () => {
          pass('Quantumult X 使用 status: "HTTP/1.1 200 OK"\n"Surge/Loon/Stash/Egern 使用 response.status: 200"')
        }
      }
    ]
  },
  {
    category: "持久化存储",
    tests: [
      {
        name: "存储 API",
        run: () => {
          const result = formatAvailability([
            {
              name: "$persistentStore.read",
              available: typeof $persistentStore !== "undefined" && hasFunction($persistentStore.read)
            },
            {
              name: "$persistentStore.write",
              available: typeof $persistentStore !== "undefined" && hasFunction($persistentStore.write)
            },
            {
              name: "$prefs.valueForKey",
              available: typeof $prefs !== "undefined" && hasFunction($prefs.valueForKey)
            },
            {
              name: "$prefs.setValueForKey",
              available: typeof $prefs !== "undefined" && hasFunction($prefs.setValueForKey)
            }
          ]);

          return result.hasAvailable ? pass(result.detail) : fail(result.detail);
        }
      },
      {
        name: "写入与读取",
        run: () => {
          const value = `ok:${Date.now()}`;
          const writeResult = writeStorage(STORAGE_TEST_KEY, value);
          const readResult = readStorage(STORAGE_TEST_KEY);
          removeStorage(STORAGE_TEST_KEY);

          return readResult === value
            ? pass(`写入结果=${stringify(writeResult)}, 读取值一致`)
            : fail(`写入结果=${stringify(writeResult)}, 读取到=${stringify(readResult)}`);
        }
      }
    ]
  },
  {
    category: "网络请求",
    tests: [
      {
        name: "网络请求能力",
        run: () => {
          const result = formatAvailability([
            ...["get", "post", "put", "delete", "patch"].map((method) => ({
              name: `$httpClient.${method}`,
              available: typeof $httpClient !== "undefined" && hasObject($httpClient) && hasFunction($httpClient[method])
            })),
            {
              name: "$task.fetch",
              available: typeof $task !== "undefined" && hasFunction($task.fetch)
            }
          ]);

          return result.hasAvailable ? pass(result.detail) : fail(result.detail);
        }
      }
    ]
  },
  {
    category: "通知与日志",
    tests: [
      {
        name: "通知 API",
        run: () => {
          const result = formatAvailability([
            {
              name: "$notification.post",
              available: typeof $notification !== "undefined" && hasFunction($notification.post)
            },
            {
              name: "$notify",
              available: hasFunction(typeof $notify !== "undefined" ? $notify : undefined)
            }
          ]);

          return result.hasAvailable ? pass(result.detail) : fail(result.detail);
        }
      },
      {
        name: "console 日志",
        run: () => {
          const result = formatAvailability(["log", "info", "warn", "error"].map((method) => ({
            name: `console.${method}`,
            available: typeof console !== "undefined" && hasFunction(console[method])
          })));

          return result.hasAvailable ? pass(result.detail) : fail(result.detail);
        }
      }
    ]
  }
];

const escapeHtml = (value) => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const runTest = (test, category) => {
  try {
    const result = test.run();
    return {
      category,
      name: test.name,
      passed: Boolean(result && result.passed),
      detail: result && result.detail ? result.detail : ""
    };
  } catch (error) {
    return {
      category,
      name: test.name,
      passed: false,
      detail: error && error.message ? error.message : String(error)
    };
  }
};

const buildGroupSummary = (group) => {
  const results = group.tests.map((test) => runTest(test, group.category));
  const passedCount = results.filter((item) => item.passed).length;

  return {
    category: group.category,
    passedCount,
    totalCount: results.length,
    results
  };
};

const formatResults = (groupSummaries) => {
  const lines = [];
  const sections = [];
  const passedCount = groupSummaries.reduce((total, group) => total + group.passedCount, 0);
  const totalCount = groupSummaries.reduce((total, group) => total + group.totalCount, 0);

  groupSummaries.forEach((group) => {
    lines.push(`[${group.category}] 通过 ${group.passedCount}/${group.totalCount}`);

    const rows = group.results.map((item) => {
      lines.push(`${item.passed ? "[PASS]" : "[FAIL]"} ${item.name} | ${item.detail}`);

      return [
        "<tr>",
        `<td><span class="status ${item.passed ? "pass" : "fail"}">${item.passed ? "PASS" : "FAIL"}</span></td>`,
        `<td>${escapeHtml(item.name)}</td>`,
        `<td>${escapeHtml(item.detail)}</td>`,
        "</tr>"
      ].join("");
    });

    sections.push([
      '<section class="group">',
      '<div class="group-head">',
      `<h2>${escapeHtml(group.category)}</h2>`,
      `<span>${group.passedCount} / ${group.totalCount}</span>`,
      "</div>",
      "<table>",
      "<thead><tr><th>结果</th><th>测试项</th><th>详情</th></tr></thead>",
      `<tbody>${rows.join("")}</tbody>`,
      "</table>",
      "</section>"
    ].join(""));
  });

  return {
    passedCount,
    totalCount,
    body: lines.join("\n"),
    sections: sections.join("")
  };
};

const buildHtmlReport = (environmentName, summary) => {
  const allPassed = summary.passedCount === summary.totalCount;
  const title = `${environmentName} iOS 代理工具兼容性测试`;
  const statusText = `总通过 ${summary.passedCount} / ${summary.totalCount}`;

  return [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    "<style>",
    "body{margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Segoe UI',sans-serif;background:#f6f7f9;color:#111827;}",
    ".wrap{max-width:1080px;margin:0 auto;}",
    ".hero{padding:24px 0 18px;border-bottom:1px solid #d8dee8;margin-bottom:18px;}",
    ".badge{display:inline-block;padding:6px 10px;border-radius:8px;font-size:13px;font-weight:700;background:" + (allPassed ? "#dcfce7" : "#fee2e2") + ";color:" + (allPassed ? "#166534" : "#991b1b") + ";}",
    "h1{margin:14px 0 8px;font-size:30px;line-height:1.2;}",
    "h2{margin:0;font-size:20px;}",
    "p{margin:8px 0;color:#4b5563;line-height:1.55;}",
    "code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#e8edf4;padding:2px 5px;border-radius:5px;}",
    ".group{margin:20px 0 0;}",
    ".group-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;}",
    ".group-head span{font-weight:700;color:#475569;}",
    "table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d8dee8;border-radius:8px;overflow:hidden;}",
    "th,td{padding:13px 14px;text-align:left;border-bottom:1px solid #e5e7eb;vertical-align:top;}",
    "td{white-space:pre-wrap;word-break:break-word;}",
    "th{background:#f8fafc;font-size:13px;color:#475569;}",
    "th:first-child,td:first-child{width:88px;}",
    ".status{display:inline-block;min-width:48px;text-align:center;border-radius:6px;padding:4px 7px;font-size:12px;font-weight:800;}",
    ".pass{background:#dcfce7;color:#166534;}",
    ".fail{background:#fee2e2;color:#991b1b;}",
    "@media(max-width:700px){body{padding:16px;}h1{font-size:24px;}th,td{padding:10px 9px;font-size:14px;}th:first-child,td:first-child{width:64px;}}",
    "</style>",
    "</head>",
    "<body>",
    '<div class="wrap">',
    '<div class="hero">',
    `<div class="badge">${escapeHtml(statusText)}</div>`,
    `<h1>${escapeHtml(title)}</h1>`,
    `<p>测试地址：<code>${escapeHtml(TEST_PAGE_URL)}</code></p>`,
    "<p>测试范围覆盖脚本环境识别、请求上下文、响应上下文、响应体改写、持久化存储、网络请求、通知日志。</p>",
    "</div>",
    summary.sections,
    "</div>",
    "</body>",
    "</html>"
  ].join("");
};

const notify = (title, subtitle, body) => {
  if (typeof $notification !== "undefined" && hasFunction($notification.post)) {
    $notification.post(title, subtitle, body);
    return;
  }

  if (hasFunction(typeof $notify !== "undefined" ? $notify : undefined)) {
    $notify(title, subtitle, body);
    return;
  }

  console.log(`${title}\n${subtitle}\n${body}`);
};

const done = (value = {}) => {
  if (hasFunction(typeof $done !== "undefined" ? $done : undefined)) {
    $.done(value);
    return;
  }

  if (typeof module !== "undefined" && module && module.exports) {
    module.exports = value;
  }
};

const doneHtml = (body) => {
  const headers = { "Content-Type": "text/html; charset=utf-8" };

  done({
    status: 200,
    headers,
    body
  });
};

(() => {
  const requestUrl = getRequestUrl();
  const environmentName = getEnvironmentName();
  const groupSummaries = TEST_GROUPS.map(buildGroupSummary);
  const summary = formatResults(groupSummaries);
  const title = `${environmentName} iOS 代理工具兼容性测试`;
  const subtitle = `总通过 ${summary.passedCount}/${summary.totalCount}`;

  if (isTestPageRequest(requestUrl)) {
    doneHtml(buildHtmlReport(environmentName, summary));
    return;
  }

  console.log(`[${environmentName}] iOS proxy tools compatibility report`);
  console.log(summary.body);
  notify(title, subtitle, summary.body);
  $.done({});
})();

function Env(e,t){const s=e=>Object.keys(e).reduce((t,s)=>(t[s.toLowerCase()]=e[s],t),{});class i{constructor(e){Object.assign(this,e),this.headers&&(this.headers=s(this.headers)),this.url&&(this.urlObj=new URL(this.url))}}class o{constructor(e){Object.assign(this,e),this.headers&&(this.headers=s(this.headers)),this.status=this.status||this.statusCode,this.statusCode=this.statusCode||this.status,delete this.url,delete this.urlObj}}const r={100:"Continue",101:"Switching Protocols",102:"Processing",103:"Early Hints",200:"OK",201:"Created",202:"Accepted",203:"Non-Authoritative Information",204:"No Content",205:"Reset Content",206:"Partial Content",207:"Multi-Status",208:"Already Reported",226:"IM Used",300:"Multiple Choices",301:"Moved Permanently",302:"Found",303:"See Other",304:"Not Modified",305:"Use Proxy",307:"Temporary Redirect",308:"Permanent Redirect",400:"Bad Request",401:"Unauthorized",402:"Payment Required",403:"Forbidden",404:"Not Found",405:"Method Not Allowed",406:"Not Acceptable",407:"Proxy Authentication Required",408:"Request Timeout",409:"Conflict",410:"Gone",411:"Length Required",412:"Precondition Failed",413:"Payload Too Large",414:"URI Too Long",415:"Unsupported Media Type",416:"Range Not Satisfiable",417:"Expectation Failed",418:"I'm a Teapot",421:"Misdirected Request",422:"Unprocessable Entity",423:"Locked",424:"Failed Dependency",425:"Too Early",426:"Upgrade Required",428:"Precondition Required",429:"Too Many Requests",431:"Request Header Fields Too Large",451:"Unavailable For Legal Reasons",500:"Internal Server Error",501:"Not Implemented",502:"Bad Gateway",503:"Service Unavailable",504:"Gateway Timeout",505:"HTTP Version Not Supported",506:"Variant Also Negotiates",507:"Insufficient Storage",508:"Loop Detected",510:"Not Extended",511:"Network Authentication Required"},a=e=>{const t=e.status||e.statusCode;if(!t)return;if("number"==typeof t)return t;const s=String(t).match(/\b(\d{3})\b/);return s?Number(s[1]):void 0},n=e=>{const t=a(e);t&&(e.status="string"==typeof e.status&&/^HTTP\/\d(?:\.\d)?\s+\d+/.test(e.status)?e.status:`HTTP/1.1 ${t} ${(e=>r[e]||"Unknown")(t)}`)};class h{constructor(e){this.env=e}send(e,t="GET"){e="string"==typeof e?{url:e}:e;let s=this.get;"POST"===t&&(s=this.post);const i=new Promise((t,i)=>{s.call(this,e,(e,s,o)=>{e?i(e):t(s)})});return e.timeout?((e,t=1e3)=>Promise.race([e,new Promise((e,s)=>{setTimeout(()=>{s(new Error("请求超时"))},t)})]))(i,e.timeout):i}get(e){return this.send.call(this.env,e)}post(e){return this.send.call(this.env,e,"POST")}}return new class{constructor(e,t){this.logLevels={debug:0,info:1,warn:2,error:3},this.logLevelPrefixs={debug:"[DEBUG] ",info:"[INFO] ",warn:"[WARN] ",error:"[ERROR] "},this.logLevel="info",this.name=e,this.http=new h(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.encoding="utf-8",this.startTime=(new Date).getTime(),this.request="undefined"!=typeof $request?new i($request):void 0,this.response="undefined"!=typeof $response?new o($response):void 0,Object.assign(this,t),this.log("",`🔔${this.name}, 开始!`)}getEnv(){return"undefined"!=typeof Egern?"Egern":"undefined"!=typeof $environment&&$environment["surge-version"]?"Surge":"undefined"!=typeof $environment&&$environment["stash-version"]?"Stash":"undefined"!=typeof module&&module.exports?"Node.js":"undefined"!=typeof $task?"Quantumult X":"undefined"!=typeof $loon?"Loon":"undefined"!=typeof $rocket?"Shadowrocket":void 0}isNode(){return"Node.js"===this.getEnv()}isQuanX(){return"Quantumult X"===this.getEnv()}isSurge(){return"Surge"===this.getEnv()}isLoon(){return"Loon"===this.getEnv()}isShadowrocket(){return"Shadowrocket"===this.getEnv()}isStash(){return"Stash"===this.getEnv()}isEgern(){return"Egern"===this.getEnv()}toObj(e,t=null){try{return JSON.parse(e)}catch{return t}}toStr(e,t=null,...s){try{return JSON.stringify(e,...s)}catch{return t}}getjson(e,t){let s=t;if(this.getdata(e))try{s=JSON.parse(this.getdata(e))}catch{}return s}setjson(e,t){try{return this.setdata(JSON.stringify(e),t)}catch{return!1}}getScript(e){return new Promise(t=>{this.get({url:e},(e,s,i)=>t(i))})}runScript(e,t){return new Promise(s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let o=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");o=o?1*o:20,o=t&&t.timeout?t.timeout:o;const[r,a]=i.split("@"),n={url:`http://${a}/v1/scripting/evaluate`,body:{script_text:e,mock_type:"cron",timeout:o},headers:{"X-Key":r,Accept:"*/*"},policy:"DIRECT",timeout:o};this.post(n,(e,t,i)=>s(i))}).catch(e=>this.logErr(e))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const e=this.path.resolve(this.dataFile),t=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(e),i=!s&&this.fs.existsSync(t);if(!s&&!i)return{};{const i=s?e:t;try{return JSON.parse(this.fs.readFileSync(i))}catch(e){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const e=this.path.resolve(this.dataFile),t=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(e),i=!s&&this.fs.existsSync(t),o=JSON.stringify(this.data);s?this.fs.writeFileSync(e,o):i?this.fs.writeFileSync(t,o):this.fs.writeFileSync(e,o)}}lodash_get(e,t,s=void 0){const i=t.replace(/\[(\d+)\]/g,".$1").split(".");let o=e;for(const e of i)if(o=Object(o)[e],void 0===o)return s;return o}lodash_set(e,t,s){return Object(e)!==e||(Array.isArray(t)||(t=t.toString().match(/[^.[\]]+/g)||[]),t.slice(0,-1).reduce((e,s,i)=>Object(e[s])===e[s]?e[s]:e[s]=(Math.abs(t[i+1])|0)===+t[i+1]?[]:{},e)[t[t.length-1]]=s),e}getdata(e){let t=this.getval(e);if(/^@/.test(e)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(e),o=s?this.getval(s):"";if(o)try{const e=JSON.parse(o);t=e?this.lodash_get(e,i,""):t}catch(e){t=""}}return t}setdata(e,t){let s=!1;if(/^@/.test(t)){const[,i,o]=/^@(.*?)\.(.*?)$/.exec(t),r=this.getval(i),a=i?"null"===r?null:r||"{}":"{}";try{const t=JSON.parse(a);this.lodash_set(t,o,e),s=this.setval(JSON.stringify(t),i)}catch(t){const r={};this.lodash_set(r,o,e),s=this.setval(JSON.stringify(r),i)}}else s=this.setval(e,t);return s}getval(e){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Egern":return $persistentStore.read(e);case"Quantumult X":return $prefs.valueForKey(e);case"Node.js":return this.data=this.loaddata(),this.data[e];default:return this.data&&this.data[e]||null}}setval(e,t){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Egern":return $persistentStore.write(e,t);case"Quantumult X":return $prefs.setValueForKey(e,t);case"Node.js":return this.data=this.loaddata(),this.data[t]=e,this.writedata(),!0;default:return this.data&&this.data[t]||null}}initGotEnv(e){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,e&&(e.headers=e.headers?e.headers:{},e&&(e.headers=e.headers?e.headers:{},void 0===e.headers.cookie&&void 0===e.headers.Cookie&&void 0===e.cookieJar&&(e.cookieJar=this.ckjar)))}get(e,t=()=>{}){switch(e.headers&&(delete e.headers["Content-Type"],delete e.headers["Content-Length"],delete e.headers["content-type"],delete e.headers["content-length"]),e.params&&(e.url+="?"+this.queryStr(e.params)),void 0===e.followRedirect||e.followRedirect||((this.isSurge()||this.isLoon())&&(e["auto-redirect"]=!1),this.isQuanX()&&(e.opts?e.opts.redirection=!1:e.opts={redirection:!1})),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Egern":default:this.isSurge()&&this.isNeedRewrite&&(e.headers=e.headers||{},Object.assign(e.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(e,(e,s,i)=>{!e&&s&&(s.body=i,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),t(e,s,i)});break;case"Quantumult X":this.isNeedRewrite&&(e.opts=e.opts||{},Object.assign(e.opts,{hints:!1})),$task.fetch(e).then(e=>{const{statusCode:s,statusCode:i,headers:o,body:r,bodyBytes:a}=e;t(null,{status:s,statusCode:i,headers:o,body:r,bodyBytes:a},r,a)},e=>t(e&&e.error||"UndefinedError"));break;case"Node.js":let s=require("iconv-lite");this.initGotEnv(e),this.got(e).on("redirect",(e,t)=>{try{if(e.headers["set-cookie"]){const s=e.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),t.cookieJar=this.ckjar}}catch(e){this.logErr(e)}}).then(e=>{const{statusCode:i,statusCode:o,headers:r,rawBody:a}=e,n=s.decode(a,this.encoding);t(null,{status:i,statusCode:o,headers:r,rawBody:a,body:n},n)},e=>{const{message:i,response:o}=e;t(i,o,o&&s.decode(o.rawBody,this.encoding))})}}post(e,t=()=>{}){const s=e.method?e.method.toLocaleLowerCase():"post";switch(e.body&&e.headers&&!e.headers["Content-Type"]&&!e.headers["content-type"]&&(e.headers["content-type"]="application/x-www-form-urlencoded"),e.headers&&(delete e.headers["Content-Length"],delete e.headers["content-length"]),void 0===e.followRedirect||e.followRedirect||((this.isSurge()||this.isLoon())&&(e["auto-redirect"]=!1),this.isQuanX()&&(e.opts?e.opts.redirection=!1:e.opts={redirection:!1})),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Egern":default:this.isSurge()&&this.isNeedRewrite&&(e.headers=e.headers||{},Object.assign(e.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient[s](e,(e,s,i)=>{!e&&s&&(s.body=i,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),t(e,s,i)});break;case"Quantumult X":e.method=s,this.isNeedRewrite&&(e.opts=e.opts||{},Object.assign(e.opts,{hints:!1})),$task.fetch(e).then(e=>{const{statusCode:s,statusCode:i,headers:o,body:r,bodyBytes:a}=e;t(null,{status:s,statusCode:i,headers:o,body:r,bodyBytes:a},r,a)},e=>t(e&&e.error||"UndefinedError"));break;case"Node.js":let i=require("iconv-lite");this.initGotEnv(e);const{url:o,...r}=e;this.got[s](o,r).then(e=>{const{statusCode:s,statusCode:o,headers:r,rawBody:a}=e,n=i.decode(a,this.encoding);t(null,{status:s,statusCode:o,headers:r,rawBody:a,body:n},n)},e=>{const{message:s,response:o}=e;t(s,o,o&&i.decode(o.rawBody,this.encoding))})}}time(e,t=null){const s=t?new Date(t):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(e)&&(e=e.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let t in i)new RegExp("("+t+")").test(e)&&(e=e.replace(RegExp.$1,1==RegExp.$1.length?i[t]:("00"+i[t]).substr((""+i[t]).length)));return e}queryStr(e){let t="";for(const s in e){let i=e[s];null!=i&&""!==i&&("object"==typeof i&&(i=JSON.stringify(i)),t+=`${s}=${i}&`)}return t=t.substring(0,t.length-1),t}msg(t=e,s="",i="",o={}){const r=e=>{const{$open:t,$copy:s,$media:i,$mediaMime:o}=e;switch(typeof e){case void 0:return e;case"string":switch(this.getEnv()){case"Surge":case"Stash":case"Egern":default:return{url:e};case"Loon":case"Shadowrocket":return e;case"Quantumult X":return{"open-url":e};case"Node.js":return}case"object":switch(this.getEnv()){case"Surge":case"Stash":case"Shadowrocket":case"Egern":default:{const r={};let a=e.openUrl||e.url||e["open-url"]||t;a&&Object.assign(r,{action:"open-url",url:a});let n=e["update-pasteboard"]||e.updatePasteboard||s;n&&Object.assign(r,{action:"clipboard",text:n});let h=e.mediaUrl||e["media-url"]||i;if(h){let e,t;if(h.startsWith("http"));else if(h.startsWith("data:")){const[s]=h.split(";"),[,i]=h.split(",");e=i,t=s.replace("data:","")}else{e=h,t=(e=>{const t={JVBERi0:"application/pdf",R0lGODdh:"image/gif",R0lGODlh:"image/gif",iVBORw0KGgo:"image/png","/9j/":"image/jpg"};for(var s in t)if(0===e.indexOf(s))return t[s];return null})(h)}Object.assign(r,{"media-url":h,"media-base64":e,"media-base64-mime":o??t})}return Object.assign(r,{"auto-dismiss":e["auto-dismiss"],sound:e.sound}),r}case"Loon":{const s={};let o=e.openUrl||e.url||e["open-url"]||t;o&&Object.assign(s,{openUrl:o});let r=e.mediaUrl||e["media-url"]||i;return r&&Object.assign(s,{mediaUrl:r}),console.log(JSON.stringify(s)),s}case"Quantumult X":{const o={};let r=e["open-url"]||e.url||e.openUrl||t;r&&Object.assign(o,{"open-url":r});let a=e.mediaUrl||e["media-url"]||i;a&&Object.assign(o,{"media-url":a});let n=e["update-pasteboard"]||e.updatePasteboard||s;return n&&Object.assign(o,{"update-pasteboard":n}),console.log(JSON.stringify(o)),o}case"Node.js":return}default:return}};if(!this.isMute)switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Egern":default:$notification.post(t,s,i,r(o));break;case"Quantumult X":$notify(t,s,i,r(o));case"Node.js":}if(!this.isMuteLog){let e=["","==============📣系统通知📣=============="];e.push(t),s&&e.push(s),i&&e.push(i),console.log(e.join("\n")),this.logs=this.logs.concat(e)}}debug(...e){this.logLevels[this.logLevel]<=this.logLevels.debug&&(e.length>0&&(this.logs=[...this.logs,...e]),console.log(`${this.logLevelPrefixs.debug}${e.map(e=>e??String(e)).join(this.logSeparator)}`))}info(...e){this.logLevels[this.logLevel]<=this.logLevels.info&&(e.length>0&&(this.logs=[...this.logs,...e]),console.log(`${this.logLevelPrefixs.info}${e.map(e=>e??String(e)).join(this.logSeparator)}`))}warn(...e){this.logLevels[this.logLevel]<=this.logLevels.warn&&(e.length>0&&(this.logs=[...this.logs,...e]),console.log(`${this.logLevelPrefixs.warn}${e.map(e=>e??String(e)).join(this.logSeparator)}`))}error(...e){this.logLevels[this.logLevel]<=this.logLevels.error&&(e.length>0&&(this.logs=[...this.logs,...e]),console.log(`${this.logLevelPrefixs.error}${e.map(e=>e??String(e)).join(this.logSeparator)}`))}log(...e){e.length>0&&(this.logs=[...this.logs,...e]),console.log(e.map(e=>e??String(e)).join(this.logSeparator))}logErr(e,t){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Egern":case"Quantumult X":default:this.log("",`❗️${this.name}, 错误!`,t,e);break;case"Node.js":this.log("",`❗️${this.name}, 错误!`,t,void 0!==e.message?e.message:e,e.stack)}}wait(e){return new Promise(t=>setTimeout(t,e))}done(e={}){const t=((new Date).getTime()-this.startTime)/1e3;switch(this.log("",`🔔${this.name}, 结束! 🕛 ${t} 秒`),this.log(),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Egern":case"Quantumult X":default:$done(this.isQuanX()?(e=>{if(!e||"object"!=typeof e)return e;const t=Object.assign({},e);return t.response&&"object"==typeof t.response&&(Object.assign(t,t.response),delete t.response,a(t)||(t.status=200)),n(t),t})(e):e);break;case"Node.js":process.exit(1)}}}(e,t)}
