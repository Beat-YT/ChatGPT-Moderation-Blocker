(function () {
    // This script is injected into the page to disable the modapi

    // first we make a backup of the original fetch function
    const _fetch = window.fetch;

    // then we replace it with a function that will modify 
    // the request parameters to set the modapi to false

    /**
     * 
     * @param {string} chunk 
     */
    function filterChunk(chunk) {
        try {
            let parts = chunk.split('\n');
            parts = parts.filter(x => !x.includes('"moderation"') && !x.includes('"moderation_response"'));
            return parts.join('\n');
        } catch (e) {
            console.error('failed to parse chunk', e);
            return null;
        }
    }

    window.fetch = async function (url, options) {
        /** @type {string} */
        const requestUrl = typeof url === 'string' ? url : url.url;

        // we only want to modify the request to the conversation endpoint and only if the modapi is enabled
        try {
            if (url && options &&
                requestUrl.startsWith("https://chatgpt.com/backend-api/conversation") &&
                options.method === "POST"
            ) {
                /*
                const body = JSON.parse(options.body);
                body['supports_modapi'] = false;
                options.body = JSON.stringify(body);
                */

                /** @type {Response} */
                const response = await _fetch.apply(this, arguments);

                if (response.status !== 200 || !response.headers.get('content-type')?.includes('text/event-stream')) {
                    console.log('conversation api response not suitable for modification, ignoring');
                    return response;
                }

                const textDecoder = new TextDecoder();
                const reader = response.body.getReader();

                const cooked = new ReadableStream({
                    start(controller) {
                        return pump();
                        function pump() {
                            return reader.read().then(({ done, value }) => {
                                // When no more data needs to be consumed, close the stream
                                if (done) {
                                    console.log('Stream complete');
                                    controller.close();
                                    return;
                                }

                                const decoded = textDecoder.decode(value);
                                console.log('[MOD]', decoded)

                                if (!decoded.includes("moderation")) {
                                    controller.enqueue(value);
                                } else {
                                    console.log('[MOD] detected moderation response, trying to remove it');
                                    const newChunks = filterChunk(decoded);

                                    if (newChunks.length === 0) {
                                        return pump();
                                    }

                                    controller.enqueue(new TextEncoder().encode(newChunks));
                                }

                                return pump();
                            });
                        }
                    },
                });

                return new Response(cooked, response);
            }

            else if (url && options &&
                requestUrl.startsWith("https://chatgpt.com/backend-api/conversation") &&
                options.method === "GET") {

                /**
                 * @type {Response}
                 */
                const response = await _fetch.apply(this, arguments);

                if (response.status !== 200 || !response.headers.get('content-type')?.startsWith('application/json')) {
                    return response;
                }

                const json = await response.json();

                if ('moderation_results' in json) {
                    json.moderation_results = [];
                }

                return new Response(JSON.stringify(json), response);
            }

        } catch (e) {
            console.error(e)
        }

        return await _fetch.apply(this, arguments);;
    }



    // make a backup of the original WebSocket class
    const _WebSocket = window.WebSocket;


    // replace the WebSocket class with a new one that will modify the data from the server

    window.WebSocket = function (url, protocols) {
        try {
            console.log('[MOD-WS] new websocket', url, protocols);
            const ws = new _WebSocket(url, protocols);
            console.log('[MOD-WS] websocket created', url, protocols);

            if (url.includes('/client/hubs/conversations')) {
                ws.addEventListener('message', (event) => {
                    if (event.data.includes('__isCheckedOut')) return;
                    event.stopImmediatePropagation();
                    event.stopPropagation();
                    event.preventDefault();

                    try {
                        const parsed = JSON.parse(event.data);
                        if (!parsed.data) return;
                        if (parsed.dataType !== 'json') {
                            console.log('[MOD-WS] Cant handle data type', parsed.dataType);
                            return;
                        }

                        let chunk = atob(parsed.data.body);
                        console.log('[MOD-WS] received', chunk);

                        if (chunk.includes("moderation")) {
                            console.log('[MOD-WS] detected moderation in response, trying to remove it');

                            const newChunk = filterChunk(chunk);
                            if (!newChunk || newChunk.length === 0) {
                                return;
                            }

                            parsed.data.body = btoa(newChunk);
                        }

                        parsed.__isCheckedOut = true;
                        ws.dispatchEvent(new MessageEvent('message', {
                            ...event,
                            data: JSON.stringify(parsed),
                        }));
                    } catch (e) {
                        console.error('[MOD-WS] error', e);
                    }
                });
            }

            return ws;
        } catch (e) {
            console.error('[MOD-WS] Failed to create websocket', e)
            throw e;
        }
    }
})();