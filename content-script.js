(function() {
    'use strict';

    const allowedHosts = ["https://forgotten-society.com"];
    const types = ["add-script", "add-rule", "clear-rules", "add-user-script", "clear-user-scripts", "check-user-scripts"];

    if (!allowedHosts.includes(location.origin)) {
        return;
    }

    window.addEventListener("message", (e) => {
        console.log(e);
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
