const { requestFactory, log, saveBills } = require('cozy-konnector-libs')
const merge = require('lodash/merge')
const { jar } = require('request')
const querystring = require('querystring')

const j = jar()

const request = requestFactory({
  // this allows request-promise to keep cookies between requests
  jar: j
})
const baseUrl = 'https://api.paybyphone.com/'
let tokenData, accountId

const lib = {}

lib.request = request // make it available for tests

lib.setTokenData = token => {
  tokenData = token
}

const authErrorToCozyError = {
  IncorrectUsernameOrPassword: 'LOGIN_FAILED',
  AccountLocked: 'LOGIN_FAILED.USER_ACTION_NEEDED'
}

const translateError = e => {
  const description = e && e.response && e.response.error_description
  return authErrorToCozyError[description] || 'UNKNOWN_ERROR'
}

// The start function is run by the BaseKonnector instance only when it got all the account
// information (fields). When you run this connector yourself in "standalone" mode or "dev" mode,
// the account information come from ./konnector-dev-config.json file
lib.start = async fields => {
  log('info', 'Authenticating ...')
  try {
    await lib.authenticate(fields.login, fields.password)
  } catch (e) {
    log('error', e)
    log('critical', translateError(e))
    return
  }
  log('info', 'Successfully logged in')
  // // The BaseKonnector instance expects a Promise as return of the function
  log('info', 'Fetching the list of parking sessions')
  const parkingSessions = await lib.fetchParkingSessions()
  const bills = parkingSessions.map(lib.billFromParkingSession)

  await saveBills(bills, fields.folderPath, {
    // PayByPhone puts the name of the town as the label of the banking operation so
    // it changes everytime
    identifiers: ['']
  })
}

lib.fetchParkingSessions = async () => {
  const accounts = await lib.authorizedRequest({
    uri: `${baseUrl}parking/accounts/`
  })
  accountId = accounts[0].id
  return lib.authorizedRequest({
    uri: `${baseUrl}parking/accounts/${accountId}/sessions?limit=10&offset=0&order=DESC&periodType=Historic`
  })
}

lib.billFromParkingSession = parkingSession => ({
  amount: parkingSession.totalCost.amount,
  date: new Date(parkingSession.startTime),
  metadata: {
    version: 1
  },
  subtype: `Parking pour ${parkingSession.vehicle.licensePlate}`,
  type: 'parking',
  vendor: 'PayByPhone',
  location: parkingSession.locationId,
  startTime: new Date(parkingSession.startTime),
  expireTime: new Date(parkingSession.expireTime),
  vehicle: parkingSession.vehicle.licensePlate
})

lib.authorizedRequest = options => {
  return request(
    merge(
      {},
      {
        headers: {
          'x-pbp-version': 2,
          Authorization: 'bearer ' + tokenData.access_token
        }
      },
      options
    )
  )
}

// this shows authentication using the [signin function](https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#module_signin)
// even if this in another domain here, but it works as an example
lib.authenticate = async function(username, password) {
  const tokenData = await request({
    method: 'POST',
    uri: 'https://api.paybyphone.com/identity/token',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: querystring.stringify({
      grant_type: 'password',
      username: `+33${username}`,
      password: password,
      client_id: 'paybyphone_webapp'
    })
  })
  lib.setTokenData(tokenData)
}

module.exports = lib
