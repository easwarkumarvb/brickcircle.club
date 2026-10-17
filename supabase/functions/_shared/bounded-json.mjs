export class RequestBodyError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Read a bounded JSON stream without allocating an unbounded request body.
 * @param {Request} request
 * @param {number} maxBytes
 */
export async function readBoundedJSON(request, maxBytes = 8192) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new RequestBodyError(415, 'JSON required.');
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes))
    throw new RequestBodyError(413, 'Request too large.');
  if (!request.body) throw new RequestBodyError(400, 'Invalid JSON.');
  const reader = request.body.getReader(), decoder = new TextDecoder('utf-8', {fatal:true});
  let size = 0, text = '';
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new RequestBodyError(413, 'Request too large.');
      }
      text += decoder.decode(value, {stream:true});
    }
    text += decoder.decode();
    try { return JSON.parse(text); }
    catch { throw new RequestBodyError(400, 'Invalid JSON.'); }
  } catch (error) {
    if (!(error instanceof RequestBodyError)) {
      await reader.cancel().catch(() => {});
      throw new RequestBodyError(400, 'Invalid JSON.');
    }
    throw error;
  } finally { reader.releaseLock(); }
}
