// main.ts
const FALLBACK_PAGE = "https://ir-netlify.github.io/NETLIFY/new/new.html";

const BLOCKED_HEADERS = [
  "host", "connection", "keep-alive", "proxy-authenticate",
  "proxy-authorization", "te", "trailer", "transfer-encoding",
  "upgrade", "forwarded", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port"
];

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const destHost = req.headers.get("x-host");

    // صفحه اصلی (fallback)
    if (url.pathname === "/" && !destHost) {
      const upgrade = (req.headers.get("upgrade") || "").toLowerCase();
      if (upgrade !== "websocket") {
        const fallbackRes = await fetch(FALLBACK_PAGE);
        return new Response(await fallbackRes.text(), {
          headers: { "content-type": "text/html; charset=UTF-8" },
        });
      }
    }

    if (!destHost) {
      return new Response("Invalid Request: Missing target host.", { status: 400 });
    }

    // ساخت URL مقصد
    const isHttps = !destHost.includes(':') || destHost.includes(':443') || /^s\d+\./.test(destHost);
    const finalUrl = `${isHttps ? 'https://' : 'http://'}${destHost}${url.pathname}${url.search}`;

    const proxyHeaders = new Headers();
    let clientAddress: string | null = null;

    for (const [key, value] of req.headers) {
      const lowerKey = key.toLowerCase();
      if (BLOCKED_HEADERS.includes(lowerKey) || 
          lowerKey.startsWith("x-nf-") || 
          lowerKey.startsWith("x-netlify-") || 
          lowerKey === "x-host") {
        continue;
      }
      
      if (lowerKey === "x-real-ip" || lowerKey === "x-forwarded-for") {
        if (!clientAddress) clientAddress = value;
        continue;
      }
      proxyHeaders.set(lowerKey, value);
    }

    if (clientAddress) {
      proxyHeaders.set("x-forwarded-for", clientAddress);
    }

    const fetchConfig: RequestInit = {
      method: req.method,
      headers: proxyHeaders,
      redirect: "manual",
      body: (req.method === "GET" || req.method === "HEAD") ? null : req.body,
    };

    const serverRes = await fetch(finalUrl, fetchConfig);
    
    const responseHeaders = new Headers(serverRes.headers);
    responseHeaders.delete("transfer-encoding");

    return new Response(serverRes.body, {
      status: serverRes.status,
      headers: responseHeaders,
    });

  } catch (err) {
    console.error(err);
    return new Response("Gateway Error: Connection Failed", { status: 502 });
  }
});