const types = ["add-script", "add-rule", "clear-rules", "add-user-script", "clear-user-scripts", "check-user-scripts"];
const allowedHosts = ["https://forgotten-society.com", "http://localhost", "http://localhost:5173"];

const FILTERS = {
    "nektome-voice":    { match: "*://nekto.me/*",                      domains: ["nekto.me", "audio.nekto.me"] },
    "airtalk":          { match: "*://app.airtalk.live/*",              domains: ["app.airtalk.live", "api.airtalk.live"] },
    "chatfish":         { match: "*://chatfish.ru/*",                   domains: ["chatfish.ru"] },
    "camee":            { match: "*://camee.tv/*",                      domains: ["camee.tv"] },
    "voisatg":          { match: "*://voisa-bot-web-kz.stivisto.com/*", domains: ["voisa-bot-web-kz.stivisto.com"] },
    "flingster":        { match: "*://flingster.com/*",                 domains: ["flingster.com"] },
    "tempocams":        { match: "*://roulette.tempocams.com/*",        domains: ["roulette.tempocams.com"] },
    "chatruletka":      { match: "*://chatruletka.com/*",               domains: ["chatruletka.com"] },
    "ome":              { match: "*://ome.tv/*",                        domains: ["ome.tv"] },
    "ommogle":          { match: "*://(www)?.ommogle.com/*",              domains: ["www.ommogle.com", "ommogle.com"] },
};  

function resolveCodeword(codeword) {
    const entry = FILTERS[codeword];
    if (!entry) {
        console.warn("Forgotten: unknown codeword, ignoring message:", codeword);
        return null;
    }
    return entry;
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (!types.includes(message.type) && !allowedHosts.includes(sender.origin)) {
        return;
    }

    if (message.type === "add-rule") {
        const entry = resolveCodeword(message.codeword);
        if (!entry) return;
        await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: [{
                id: message.ruleId,
                priority: 1,
                action: {
                    type: "modifyHeaders",
                    requestHeaders: message.requestsHeaders,
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
        const rulesIds = [];
        for (const rule of rules) {
            rulesIds.push(rule.id);
        }
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: rulesIds,
        })
    } else if (message.type === "check-user-scripts") {
        await sendResponse({userScripts: typeof chrome.userScripts !== "undefined"});
    } else if (message.type === "add-user-script") {
        if (typeof chrome.userScripts === "undefined") {
            console.warn("userScripts disabled — enable 'Allow user scripts' for this extension in chrome://extensions.");
            return;
        }
        const entry = resolveCodeword(message.codeword);
        if (!entry) return;
        try {
            await chrome.userScripts.unregister({ids: [message.id]}).catch(() => {});
            await chrome.userScripts.register([{
                id: message.id,
                matches: [entry.match],
                js: [{code: message.script}],
                world: message.world || "MAIN",
                allFrames: true,
                runAt: "document_start",
            }]);
        } catch (e) {
            console.warn("userScripts.register failed:", e);
        }
    } else if (message.type === "clear-user-scripts") {
        if (typeof chrome.userScripts === "undefined") {
            return;
        }
        const scripts = await chrome.userScripts.getScripts();
        if (scripts.length) {
            await chrome.userScripts.unregister({ids: scripts.map((script) => script.id)});
        }
    }
});
