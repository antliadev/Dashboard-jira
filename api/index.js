/**
 * api/index.js — Test Express import + body inspection
 */
import app from '../server/index.js';

export default function handler(req, res) {
  // Inspect body WITHOUT calling app()
  let bodyInfo;
  try {
    if (Buffer.isBuffer(req.body)) bodyInfo = 'Buffer[' + req.body.length + ']';
    else if (typeof req.body === 'string') bodyInfo = 'string(' + req.body.length + '): ' + req.body.slice(0, 100);
    else if (typeof req.body === 'object' && req.body !== null) bodyInfo = 'object: ' + JSON.stringify(req.body).slice(0, 200);
    else bodyInfo = String(req.body);
  } catch (e) { bodyInfo = 'ERROR: ' + e.message; }
  
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('bodyType=' + typeof req.body + ' body=' + bodyInfo);
}
