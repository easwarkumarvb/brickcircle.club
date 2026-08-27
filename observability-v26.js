/* BrickCircle V2.6 observability bridge. Safe without Sentry; enable by defining BC_SENTRY_DSN and loading Sentry before this file. */
(()=>{
  const cfg=window.BC_OBSERVABILITY||{};
  if(window.Sentry&&cfg.sentryDsn){
    try{window.Sentry.init({dsn:cfg.sentryDsn,environment:cfg.environment||'production',tracesSampleRate:Number(cfg.tracesSampleRate||0.05)});}catch(e){console.warn('Sentry init failed',e)}
  }
  window.addEventListener('error',e=>window.Sentry?.captureException?.(e.error||new Error(e.message)));
  window.addEventListener('unhandledrejection',e=>window.Sentry?.captureException?.(e.reason instanceof Error?e.reason:new Error(String(e.reason))));
  window.bcMeasure=async(name,fn,meta={})=>{
    const t=performance.now();
    try{return await fn();}
    finally{
      const ms=Math.round((performance.now()-t)*100)/100;
      window.dispatchEvent(new CustomEvent('bc:metric',{detail:{name,duration_ms:ms,properties:meta}}));
    }
  };
})();