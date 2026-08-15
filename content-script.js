(function() {
    'use strict';

    const types = ["add-rule", "clear-rules", "add-user-script", "clear-user-scripts", "sync-nekto-cookies", "request-extension-permission"];

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

    if (!isAllowedAppOrigin(location.origin)) {
        return;
    }

    window.addEventListener("message", async (e) => {
        if (e.source === window.self && isAllowedAppOrigin(e.origin) && types.includes(e.data?.type)) {
            if (e.data.type === "request-extension-permission") {
                const res = await chrome.runtime.sendMessage({type: "check-user-scripts"});
                window.postMessage({
                    type: "extension-loaded",
                    userScripts: Boolean(res?.ok && res.userScripts),
                    version: chrome.runtime.getVersion(),
                    step: e.data.step,
                }, location.origin);
            } else {
                let response;
                try {
                    response = await chrome.runtime.sendMessage(e.data);
                } catch (error) {
                    response = {ok: false, error: error?.message || String(error)};
                }
                window.postMessage({
                    type: "extension-operation-result",
                    requestId: e.data.requestId,
                    ...(response || {ok: false, error: "Extension returned no response"}),
                }, location.origin);
            }
        } 
    });

})();
