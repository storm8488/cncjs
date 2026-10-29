module.exports = (api) => {
  const { env } = { ...api };
  const plugins = [
    'lodash',
  ];

  if (typeof env === 'function' && env('test')) {
    // Enable async/await for jest
    plugins.push('@babel/plugin-transform-runtime');
  }

  // Fast refresh is for the browser bundle only: `babel -d` of src/server in
  // development (build-dev.sh, or build-prod.sh steps run without NODE_ENV)
  // must never get it, or the server dies on `$RefreshReg$ is not defined`.
  const webpackLoader = typeof api.caller === 'function' && api.caller((caller) => Boolean(caller && caller.name === 'babel-loader'));
  if (typeof env === 'function' && env('development') && webpackLoader) {
    plugins.push('react-refresh/babel');
  }

  return {
    presets: [
      '@babel/preset-env',
      '@babel/preset-react'
    ],
    plugins,
  };
};
