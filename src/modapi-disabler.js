(function () {
    // This script is injected into the page to disable the modapi

    // first we make a backup of the original fetch function
    const _fetch = window.fetch;

    // then we replace it with a function that will modify 
    // the request parameters to set the modapi to false

    window.fetch = async function (url, options) {
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

                /** @type {Response} */
                const response = await _fetch.apply(this, arguments);

                if (response.status !== 200) {
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
                                    controller.close();
                                    return;
                                }

                                const decoded = textDecoder.decode(value);

                                console.log(decoded)

                                if (!decoded.includes("moderation_response")) {
                                    controller.enqueue(value);
                                } else {
                                    // now we gotta iterate through the dataes and remove all the moderation responses
                                    const splitter = decoded.split('data: ');
                                    splitter.shift();

                                    const reponse = splitter.map((dataChunk) => {
                                        if (dataChunk.trim() == '[DONE]') {
                                            return 'data: ' + dataChunk;
                                        }

                                        const parsed = JSON.parse(dataChunk.trim());

                                        if ('moderation_response' in parsed) {
                                            return null;
                                        }

                                        return 'data: ' + JSON.stringify(parsed);
                                    }).filter((dataChunk) => dataChunk !== null);

                                    console.log('no more moderation! poof', reponse)


                                    if (reponse.length === 0) {
                                        return pump();
                                    }

                                    controller.enqueue(new TextEncoder().encode(reponse.join('\n\n')));
                                }


                                return pump();
                            });
                        }
                    },
                });

                return new Response(cooked, response);
            }

            else if (url && options &&
                url.startsWith("https://chat.openai.com/backend-api/conversation") &&
                options.method === "GET") {

                const response = await _fetch.apply(this, arguments);

                if (response.status !== 200) {
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



})();