// Pure transport decision used by every isolated browser context, including extra actors.
export function isIsolatedTransport(url,origin){
  try {const target=new URL(url),local=new URL(origin);return !target.username&&!target.password&&!local.username&&!local.password&&['http:','https:'].includes(target.protocol)&&target.origin===local.origin&&['127.0.0.1','localhost'].includes(local.hostname);}catch{return false;}
}
