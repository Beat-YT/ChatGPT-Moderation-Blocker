(function () {
    // This script is injected into the page to disable the modapi

    // first we make a backup of the original fetch function
    const _fetch = window.fetch;

    // then we replace it with a function that will modify 
    // the request parameters to set the modapi to false

    window.fetch = function (url, options) {
        // we only want to modify the request to the conversation endpoint and only if the modapi is enabled
        try {

            if (url && options &&
                url.startsWith("https://chat.openai.com/backend-api/conversation") &&
                options.method === "POST"
            ) {
                // we parse the body and set the modapi support to false
                const body = JSON.parse(options.body);
                body['supports_modapi'] = false;
                options.body = JSON.stringify(body);
                console.log("[ModAPI Disabler - ChatGPT Moderation Blocker] Patched ModAPI")
            }

        } catch (e) {
            console.error(e)
        }

        return _fetch.apply(this, arguments);
    }

})();