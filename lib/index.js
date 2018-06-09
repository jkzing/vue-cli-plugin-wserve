const {
  info,
  hasYarn,
  openBrowser,
  IpcMessenger
} = require('@vue/cli-shared-utils')

const defaults = {
  host: '0.0.0.0',
  port: 8080,
  https: false
}

module.exports = (api, options) => {
  api.registerCommand('wserve', {
    description: 'start development server',
    usage: 'vue-cli-service wserve [options] [entry]',
    options: {
      '--open': `open browser on server start`,
      '--mode': `specify env mode (default: development)`,
      '--host': `specify host (default: ${defaults.host})`,
      '--port': `specify port (default: ${defaults.port})`,
      '--https': `use https (default: ${defaults.https})`
    }
  }, async function serve (args) {
    info('Starting development server...')

    // although this is primarily a dev server, it is possible that we
    // are running it in a mode with a production env, e.g. in E2E tests.
    const isProduction = process.env.NODE_ENV === 'production'

    const path = require('path')
    const url = require('url')
    const chalk = require('chalk')
    const webpack = require('webpack')
    const serve = require('webpack-serve')
    const convert = require('koa-connect')
    const compress = require('koa-compress')
    const history = require('connect-history-api-fallback')
    // const proxy = require('http-proxy-middleware')
    // const WebpackDevServer = require('webpack-dev-server')
    const Router = require('koa-router')
    const portfinder = require('portfinder')
    const prepareURLs = require('./util/prepareURLs')
    // const prepareProxy = require('./util/prepareProxy')
    const launchEditorMiddleware = require('launch-editor-middleware')

    // load user devServer options
    const projectDevServerOptions = options.devServer || {}

    // resolve webpack config
    const webpackConfig = api.resolveWebpackConfig()

    // expose advanced stats
    // TODO: vue-cli DashboardPlugin
    // if (args.dashboard) {
    //   const DashboardPlugin = require('../webpack/DashboardPlugin')
    //   ;(webpackConfig.plugins = webpackConfig.plugins || []).push(new DashboardPlugin({
    //     type: 'serve'
    //   }))
    // }

    // entry arg
    const entry = args._[0]
    if (entry) {
      webpackConfig.entry = {
        app: api.resolve(entry)
      }
    }

    // resolve server options
    const useHttps = args.https || projectDevServerOptions.https || defaults.https
    const protocol = useHttps ? 'https' : 'http'
    const host = args.host || process.env.HOST || projectDevServerOptions.host || defaults.host
    portfinder.basePort = args.port || process.env.PORT || projectDevServerOptions.port || defaults.port
    const port = await portfinder.getPortPromise()

    const urls = prepareURLs(
      protocol,
      host,
      port,
      options.baseUrl
    )

    // const proxySettings = prepareProxy(
    //   projectDevServerOptions.proxy,
    //   api.resolve('public')
    // )

    // create compiler
    const compiler = webpack(webpackConfig)

    const server = await serve({
      // TODO: client log level
      compiler,
      host: host || 'localhost',
      port,
      // content: api.resolve('public'),
      // TODO: watch content base
      hot: !isProduction,
      // TODO: quiet
      clipboard: args.copy,
      dev: {
        publicPath: options.baseUrl
      },
      // TODO: overlay
      // TODO: https: {}
      add (app, middleware, options) {
        // const router = new Router()
        // const historyApiOptions = {
        //   disableDotRule: true,
        //   rewrites: [
        //     {
        //       from: /./,
        //       to: path.posix.join(options.baseUrl || '', 'index.html')
        //     }
        //   ]
        // }

        // router.get('/__open-in-editor', convert(launchEditorMiddleware(() => console.log(
        //   `To specify an editor, sepcify the EDITOR env variable or ` +
        //   `add "editor" field to your Vue project config.\n`
        // ))))
        // // app.use(convert(history(historyApiOptions)))
        // app.use(router.routes())
        // if (isProduction) {
        //   app.use(compress())
        // }

        // TODO: proxy here
      }
    })

    ;['SIGINT', 'SIGTERM'].forEach(signal => {
      process.on(signal, () => {
        server.close(() => {
          process.exit(0)
        })
      })
    })

    // on appveyor, killing the process with SIGTERM causes execa to
    // throw error
    // if (process.env.VUE_CLI_TEST) {
    //   process.stdin.on('data', data => {
    //     if (data.toString() === 'close') {
    //       console.log('got close signal!')
    //       server.close(() => {
    //         process.exit(0)
    //       })
    //     }
    //   })
    // }

    return new Promise((resolve, reject) => {
      // log instructions & open browser on first compilation complete
      let isFirstCompile = true
      compiler.hooks.done.tap('vue-cli-service wserve', stats => {
        if (stats.hasErrors()) {
          return
        }

        console.log()
        console.log([
          `  App running at:`,
          `  - Local:   ${chalk.cyan(urls.localUrlForTerminal)}`,
          `  - Network: ${chalk.cyan(urls.lanUrlForTerminal)}`
        ].join('\n'))
        console.log()

        if (isFirstCompile) {
          isFirstCompile = false

          if (!isProduction) {
            const buildCommand = hasYarn() ? `yarn build` : `npm run build`
            console.log(`  Note that the development build is not optimized.`)
            console.log(`  To create a production build, run ${chalk.cyan(buildCommand)}.`)
          } else {
            console.log(`  App is served in production mode.`)
            console.log(`  Note this is for preview or E2E testing only.`)
          }
          console.log()

          if (args.open || projectDevServerOptions.open) {
            openBrowser(urls.localUrlForBrowser)
          }

          // Send final app URL
          if (args.dashboard) {
            const ipc = new IpcMessenger()
            ipc.connect()
            ipc.send({
              vueServe: {
                url: urls.localUrlForBrowser
              }
            })
          }

          // resolve returned Promise
          // so other commands can do api.service.run('serve').then(...)
          resolve({
            server,
            url: urls.localUrlForBrowser
          })
        } else if (process.env.VUE_CLI_TEST) {
          // signal for test to check HMR
          console.log('App updated')
        }
      })
    })
  })
}

module.exports.defaultModes = {
  serve: 'development'
}
