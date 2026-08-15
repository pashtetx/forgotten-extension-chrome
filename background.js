const TARGET_DOMAIN = "nekto.me";
const TARGET_COOKIE_NAMES = new Set(["__hash_", "__jhash_", "__js_p_", "__jua_"]);
const activeNektoPartitions = new Map();

function isTargetCookie(cookie) {
    const domain = cookie.domain.replace(/^\./, "").toLowerCase();
    const isNektoDomain = domain === TARGET_DOMAIN || domain.endsWith(`.${TARGET_DOMAIN}`);
    return isNektoDomain && TARGET_COOKIE_NAMES.has(cookie.name);
}

function buildCrossSiteCookie(cookie) {
    const host = cookie.domain.replace(/^\./, "");
    const details = {
        url: `https://${host}${cookie.path || "/"}`,
        name: cookie.name,
        value: cookie.value,
        path: cookie.path || "/",
        secure: true,
        httpOnly: cookie.httpOnly,
        sameSite: "no_restriction",
        storeId: cookie.storeId,
    };

    if (!cookie.hostOnly) details.domain = cookie.domain;
    if (!cookie.session && cookie.expirationDate) {
        details.expirationDate = cookie.expirationDate;
    }

    if (cookie.partitionKey) {
        details.partitionKey = cookie.partitionKey;
    }

    return details;
}

function partitionKeyForOrigin(origin) {
    const url = new URL(origin);
    const topLevelSite = url.hostname === "localhost"
        ? `${url.protocol}//localhost`
        : `${url.protocol}//forgotten-society.com`;
    return {topLevelSite, hasCrossSiteAncestor: true};
}

async function writeCrossSiteCookie(cookie) {
    const writes = [chrome.cookies.set(buildCrossSiteCookie(cookie))];
    if (!cookie.partitionKey) {
        for (const partitionKey of activeNektoPartitions.values()) {
            writes.push(chrome.cookies.set({
                ...buildCrossSiteCookie(cookie),
                partitionKey,
            }));
        }
    }

    await Promise.all(writes);
}

async function syncNektoCookies(origin) {
    const partitionKey = partitionKeyForOrigin(origin);
    activeNektoPartitions.set(partitionKey.topLevelSite, partitionKey);
    const cookies = await chrome.cookies.getAll({domain: TARGET_DOMAIN});
    await Promise.all(cookies.filter(isTargetCookie).map(cookie => writeCrossSiteCookie(cookie)));
}

function isNektoUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" &&
            (url.hostname === TARGET_DOMAIN || url.hostname.endsWith(`.${TARGET_DOMAIN}`));
    } catch {
        return false;
    }
}

async function waitForTabLoad(tabId, initialStatus) {
    if (initialStatus === "complete") return;
    await new Promise(resolve => {
        const timeout = setTimeout(finish, 6000);

        function finish() {
            clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(onUpdated);
            chrome.tabs.onRemoved.removeListener(onRemoved);
            resolve();
        }

        function onUpdated(updatedTabId, changeInfo) {
            if (updatedTabId === tabId && changeInfo.status === "complete") finish();
        }

        function onRemoved(removedTabId) {
            if (removedTabId === tabId) finish();
        }

        chrome.tabs.onUpdated.addListener(onUpdated);
        chrome.tabs.onRemoved.addListener(onRemoved);
    });
}

async function registerNektoCookiesInFirstParty(origin, requestedUrl) {
    const url = isNektoUrl(requestedUrl) ? requestedUrl : "https://nekto.me/audiochat";
    const tab = await chrome.tabs.create({url, active: false});

    try {
        await waitForTabLoad(tab.id, tab.status);
        await new Promise(resolve => setTimeout(resolve, 500));
        await syncNektoCookies(origin);
    } finally {
        await chrome.tabs.remove(tab.id).catch(() => {});
    }
}

chrome.cookies.onChanged.addListener(async (changeInfo) => {
    const cookie = changeInfo.cookie;
    if (!isTargetCookie(cookie) || changeInfo.removed) {
        return;
    }

    if (cookie.secure && cookie.sameSite === "no_restriction") {
        return;
    }

    try {
        await writeCrossSiteCookie(cookie);
    } catch (error) {
        console.error("Forgotten: failed to make Nekto cookie available to iframe", error);
    }
});

const types = ["add-rule", "clear-rules", "add-user-script", "clear-user-scripts", "check-user-scripts", "sync-nekto-cookies"];

function isAllowedAppOrigin(origin) {
    try {
        const url = new URL(origin);
        const isForgotten = url.protocol === "https:" && ["forgotten-society.com", "www.forgotten-society.com"].includes(url.hostname);
        const isLocalhost = ["http:", "https:"].includes(url.protocol) && url.hostname === "localhost";
        return isForgotten || isLocalhost;
    } catch {
        return false;
    }
}

const FILTERS = {
    "nektome-voice": { matches: ["https://nekto.me/*", "https://*.nekto.me/*"], domains: ["nekto.me", "audio.nekto.me"] },
    "chatfish": { matches: ["https://chatfish.ru/*", "https://*.chatfish.ru/*"], domains: ["chatfish.ru"] },
};  

function resolveCodeword(codeword) {
    const entry = FILTERS[codeword];
    if (!entry) {
        console.warn("Forgotten: unknown codeword, ignoring message:", codeword);
        return null;
    }
    return entry;
}

async function handleMessage(message, senderOrigin) {
    if (message.type === "add-rule") {
        const entry = resolveCodeword(message.codeword);
        if (!entry) throw new Error("Unknown codeword");
        await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: [{
                id: message.ruleId,
                priority: 1,
                action: {
                    type: "modifyHeaders",
                    requestHeaders: message.requestHeaders,
                    responseHeaders: message.responseHeaders,
                },
                condition: {
                    requestDomains: entry.domains,
                    resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest"]
                }
            }],
            removeRuleIds: message.removeRuleIds || []
        });
    } else if (message.type === "clear-rules") {
        const rules = await chrome.declarativeNetRequest.getDynamicRules();
        if (rules.length) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: rules.map(rule => rule.id),
            });
        }
    } else if (message.type === "check-user-scripts") {
        return {userScripts: typeof chrome.userScripts !== "undefined"};
    } else if (message.type === "add-user-script") {
        if (typeof chrome.userScripts === "undefined") {
            throw new Error("User scripts are disabled");
        }
        const entry = resolveCodeword(message.codeword);
        if (!entry) throw new Error("Unknown codeword");
        if (typeof message.script !== "string" || !/^forgotten-injector-\d+$/.test(message.id)) {
            throw new Error("Invalid injector payload");
        }
        await chrome.userScripts.unregister({ids: [message.id]}).catch(() => {});
        await chrome.userScripts.register([{
            id: message.id,
            matches: entry.matches,
            js: [{code: message.script}],
            world: "MAIN",
            allFrames: true,
            runAt: "document_start",
        }]);
    } else if (message.type === "clear-user-scripts") {
        if (typeof chrome.userScripts === "undefined") {
            throw new Error("User scripts are disabled");
        }
        const scripts = await chrome.userScripts.getScripts();
        if (scripts.length) {
            await chrome.userScripts.unregister({ids: scripts.map(script => script.id)});
        }
    } else if (message.type === "sync-nekto-cookies") {
        await registerNektoCookiesInFirstParty(senderOrigin, message.url);
    }

    return {};
}

let operationQueue = Promise.resolve();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    let senderOrigin = sender.origin;
    if (!senderOrigin && sender.url) {
        try {
            senderOrigin = new URL(sender.url).origin;
        } catch {}
    }
    if (!types.includes(message?.type) || !isAllowedAppOrigin(senderOrigin)) {
        return;
    }

    const operation = operationQueue.then(() => handleMessage(message, senderOrigin));
    operationQueue = operation.catch(() => {});
    operation
        .then(result => sendResponse({ok: true, ...result}))
        .catch(error => sendResponse({ok: false, error: error?.message || String(error)}));
    return true;
});
