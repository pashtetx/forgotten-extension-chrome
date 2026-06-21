(function() {
    'use strict';
    if (window.name == "firstIFrame" || window.name === "secondIFrame") {
        const nativeLGI = localStorage.getItem.bind(localStorage);
        const nativeLSI = localStorage.setItem.bind(localStorage);

        window.localStorage.getItem = function (key) {
            return nativeLGI(window.name + "_" + key);
        }

        window.localStorage.setItem = function (key, value) {
            return nativeLSI(window.name + "_" + key, value);

        }
        window.addEventListener("message", (e) => {
            const {type, script} = e.data;
            if (type === "add-script") {
                let scriptEl = document.createElement("script");
                scriptEl.innerHTML = script;
                scriptEl.type = "module";
                document.body.prepend(scriptEl);
            }
        });

        window.addEventListener("DOMContentLoaded", () => {
            window.parent.postMessage({type: "loaded", name: window.name}, "*");
        });
    }

    if (location.hostname === "forgotten-society.com" || location.hostname === "localhost") {
        window.addEventListener("DOMContentLoaded", () => {
            window.postMessage({type: "extension-loaded"}, "*");
        });
    }
})();