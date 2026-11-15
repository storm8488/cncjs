// `options.workOffset` for the services built by the tests written before D2: their fake
// controllers do not answer `$#`, so the work offset is taken as proven, always. It exists
// only under __tests__. The interface is the one PLAN-CORRECTIONS § 1.1 describes (a factory
// called once per controller); lot S2 adjusts it to work-offset.js.
export const provenOffset = () => ({
  state: () => 'proven',
  proven: () => true,
  checking: () => false,
  // Called at each status report; invalidations, stops and `verifyOffset` change nothing here.
  tick: () => {},
  invalidate: () => {},
  cancel: () => {},
  verify: () => {},
  snapshot: () => ({
    state: 'proven',
    code: null,
    params: null,
    detail: null,
    wcs: null,
    stored: null,
    reported: null,
    reloaded: false,
    attempts: 0,
    canVerify: false
  })
});
