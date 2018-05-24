process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://7b56d80312cc4054929dcd2e4e2bf986:ab77d71ea8164914b5b50de6a2e718cc@sentry.cozycloud.cc/50'

const { BaseKonnector } = require('cozy-konnector-libs')
const { start } = require('./lib')

module.exports = new BaseKonnector(start)
