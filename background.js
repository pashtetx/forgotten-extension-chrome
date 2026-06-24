const types = ["add-script", "add-rule", "clear-rules", "clear-user-scripts", "check-user-scripts"];
const allowedHosts = ["https://forgotten-society.com", "http://localhost", "http://localhost:5173"];

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    console.log(!types.includes(message.type), allowedHosts.includes(sender.origin));
    if (!types.includes(message.type) && !allowedHosts.includes(sender.origin)) {
        return;
    }
    if (message.type === "add-rule") {
        await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: [{
                id: message.ruleId,
                priority: 1,
                action: {
                    type: "modifyHeaders",
                    requestHeaders: [{
                        header: "User-Agent",
                        operation: "set",
                        value: message.userAgent,
                    }]
                },
                condition: {
                    urlFilter: message.filter, 
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
        console.log({userScripts: chrome.userScripts});
        await sendResponse({userScripts: chrome.userScripts});
    } else if (message.type === "add-user-script") {
        chrome.userScripts.register({
            id: message.id,
            matches: [message.filter],
            js: [{code: message.script}],
        });
    } else if (message.type === "clear-user-scripts") {
        const scripts = chrome.userScripts.getScripts();
        chrome.userScripts.unregister({ids: scripts.map((script) => {return script.id})});
    }
});