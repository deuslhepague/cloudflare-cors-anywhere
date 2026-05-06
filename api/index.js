export const config = {
  runtime: 'edge',
};

const blacklistUrls = [];
const whitelistOrigins = [ ".*" ];

function isListedInWhitelist(uri, listing) {
    let isListed = false;
    if (typeof uri === "string") {
        listing.forEach((pattern) => {
            if (uri.match(pattern) !== null) {
                isListed = true;
            }
        });
    } else {
        isListed = true;
    }
    return isListed;
}

export default async function (request) {
    const isPreflightRequest = (request.method === "OPTIONS");
    const originUrl = new URL(request.url);

    function setupCORSHeaders(headers) {
        headers.set("Access-Control-Allow-Origin", request.headers.get("Origin") || "*");
        if (isPreflightRequest) {
            headers.set("Access-Control-Allow-Methods", request.headers.get("access-control-request-method") || "GET, POST, OPTIONS");
            const requestedHeaders = request.headers.get("access-control-request-headers");
            if (requestedHeaders) {
                headers.set("Access-Control-Allow-Headers", requestedHeaders);
            }
            headers.delete("X-Content-Type-Options");
        }
        return headers;
    }

    // Pega a URL alvo removendo o "?" do começo
    const targetUrlStr = originUrl.search.substring(1);

    if (!targetUrlStr) {
         let responseHeaders = new Headers();
         responseHeaders = setupCORSHeaders(responseHeaders);
         const connectingIp = request.headers.get("x-real-ip") || "desconhecido";

         return new Response(
             "VERCEL-CORS-ANYWHERE\n\n" +
             "Como usar:\n" +
             originUrl.origin + "/?sua-url-aqui\n\n" +
             "Seu IP: " + connectingIp + "\n",
             { status: 200, headers: responseHeaders }
         );
    }

    const targetUrl = decodeURIComponent(decodeURIComponent(targetUrlStr));
    const originHeader = request.headers.get("Origin");

    if ((!isListedInWhitelist(targetUrl, blacklistUrls)) && (isListedInWhitelist(originHeader, whitelistOrigins))) {
        let customHeaders = request.headers.get("x-cors-headers");

        if (customHeaders !== null) {
            try { customHeaders = JSON.parse(customHeaders); } catch (e) {}
        }

        const filteredHeaders = {};
        for (const [key, value] of request.headers.entries()) {
            if (
                (key.match("^origin") === null) &&
                (key.match("eferer") === null) &&
                (key.match("^x-forw") === null) &&
                (key.match("^x-vercel") === null) &&
                (key.match("^x-cors-headers") === null)
            ) {
                filteredHeaders[key] = value;
            }
        }

        if (customHeaders !== null) {
            Object.entries(customHeaders).forEach((entry) => (filteredHeaders[entry[0]] = entry[1]));
        }

        const newRequest = new Request(request, {
            redirect: "follow",
            headers: filteredHeaders
        });

        try {
            const response = await fetch(targetUrl, newRequest);
            let responseHeaders = new Headers(response.headers);
            const exposedHeaders = [];
            const allResponseHeaders = {};

            for (const [key, value] of response.headers.entries()) {
                exposedHeaders.push(key);
                allResponseHeaders[key] = value;
            }
            exposedHeaders.push("cors-received-headers");
            responseHeaders = setupCORSHeaders(responseHeaders);

            responseHeaders.set("Access-Control-Expose-Headers", exposedHeaders.join(","));
            responseHeaders.set("cors-received-headers", JSON.stringify(allResponseHeaders));

            const responseBody = isPreflightRequest ? null : await response.arrayBuffer();

            return new Response(responseBody, {
                headers: responseHeaders,
                status: isPreflightRequest ? 200 : response.status,
                statusText: isPreflightRequest ? "OK" : response.statusText
            });
        } catch (err) {
            return new Response("Erro ao buscar a URL alvo: " + err.message, { status: 500 });
        }
    } else {
        return new Response("Acesso Negado (Forbidden)", { status: 403 });
    }
}
