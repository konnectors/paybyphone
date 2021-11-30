process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://f07f71bc8a764d7487eaf84963fd7bb3@errors.cozycloud.cc/11'

const { BaseKonnector } = require('cozy-konnector-libs')
const { start } = require('./lib')

module.exports = new BaseKonnector(start)
