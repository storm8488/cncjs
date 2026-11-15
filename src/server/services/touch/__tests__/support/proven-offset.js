// `options.workOffset` for the services built by the tests written before D2: their fake
// controllers do not answer `$#`, so the work offset is taken as proven, always. It exists
// only under __tests__. Same interface as createWorkOffset (work-offset.js): a factory called
// once per controller record.
export const provenOffset = () => ({
  state: () => 'proven',
  proven: () => true,
  proof: () => 0,
  checking: () => false,
  // Called at each status report and $G report; invalidations, stops and `verifyOffset` change nothing here.
  tick: () => {},
  modal: () => {},
  invalidate: () => {},
  cancel: () => {},
  verify: () => {},
  retry: () => {},
  refusal: () => null,
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
    canVerify: true
  }),
  signature: () => 'proven'
});
