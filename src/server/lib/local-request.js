// D3 locality: trust the TCP peer only, and reject forwarded requests.
export const localRequest = (req) => {
  const headers = (req && req.headers) || {};
  if (Object.keys(headers).some((key) => ['x-forwarded-for', 'forwarded', 'x-real-ip'].includes(key.toLowerCase()))) {
    return false;
  }
  const address = req && req.socket && req.socket.remoteAddress;
  if (address === '::1') {
    return true;
  }
  const match = typeof address === 'string' && /^(?:::ffff:)?(127\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(address);
  return !!match && match[1].split('.').every((part) => Number(part) <= 255);
};
