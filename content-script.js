(function() {
    'use strict';

    const allowedHosts = ["https://forgotten-society.com", "http://localhost", "http://localhost:5173"];
    const types = ["add-script", "add-rule", "clear-rules", "clear-user-scripts"];

    if (!allowedHosts.includes(window.location.origin)) {
        return;
    }

    window.addEventListener("message", (e) => {
        if (e.source === window.self && allowedHosts.includes(e.origin) && types.includes(e.data.type)) {
            chrome.runtime.sendMessage(e.data);
        } 
    });

    window.addEventListener("DOMContentLoaded", async () => {
        const res = await chrome.runtime.sendMessage({type: "check-user-scripts"});
        window.postMessage({
            type: "extension-loaded",
            userScripts: res.userScripts,
            version: chrome.runtime.getVersion(),
        })
    });

})();