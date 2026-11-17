// The page's own rule for "this machine is busy, no automatic reload" (F10,
// examples/cncjs-touch/touch/tablet-actions.js, controllerBusy), read from the page file itself so
// that the interaction tests of the merged lots (F1 with F10) follow any change of that rule.
import fs from 'fs';
import path from 'path';

const PAGE = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'examples', 'cncjs-touch', 'touch', 'tablet-actions.js');

export const pageSeesBusy = (() => {
  const text = fs.readFileSync(PAGE, 'utf8');
  const match = /function controllerBusy\(c\)\{return ([\s\S]*?);\}\n/.exec(text);
  if (!match) {
    throw new Error('controllerBusy not found in tablet-actions.js');
  }
  // eslint-disable-next-line no-new-func
  const busy = new Function('c', 'return !!(' + match[1] + ');');
  // The server sends its snapshot through JSON: the page never sees anything else.
  return (snapshot) => busy(JSON.parse(JSON.stringify(snapshot)));
})();
