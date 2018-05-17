const {
  BaseKonnector,
  requestFactory,
  log,
  saveBills
} = require('cozy-konnector-libs')
const merge = require('lodash/merge')
const { jar } = require('request')
const querystring = require('querystring')

const j = jar()

const request = requestFactory({
  // this allows request-promise to keep cookies between requests
  jar: j
})

module.exports = new BaseKonnector(start)

const baseUrl = 'https://api.paybyphone.com/'
let tokenData, accountId

// The start function is run by the BaseKonnector instance only when it got all the account
// information (fields). When you run this connector yourself in "standalone" mode or "dev" mode,
// the account information come from ./konnector-dev-config.json file
async function start(fields) {
  log('info', 'Authenticating ...')
  await authenticate(fields.login, fields.password)
  log('info', 'Successfully logged in')
  // // The BaseKonnector instance expects a Promise as return of the function
  log('info', 'Fetching the list of parking sessions')
  const accounts = await authorizedRequest({
    uri: `${baseUrl}parking/accounts/`
  })
  accountId = accounts[0].id
  const parkingSessions = await authorizedRequest({
    uri: `${baseUrl}parking/accounts/${accountId}/sessions?limit=10&offset=0&order=DESC&periodType=Historic`
  })
  const bills = parkingSessions.map(s => ({
    amount: s.totalCost.amount,
    date: s.startTime,
    metadata: {
      version: 1
    },
    subtype: `Parking pour ${s.vehicle.licensePlate}`,
    type: 'parking',
    vendor: 'PayByPhone',
    location: s.locationId,
    startTime: s.startTime,
    expireTime: s.expireTime,
    vehicle: s.vehicle.licensePlate
  }))

  await saveBills(bills, fields.folderPath, {
    // PayByPhone puts the name of the town as the label of the banking operation so
    // it changes everytime
    identifiers: ['']
  })
}

function authorizedRequest(options) {
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
function authenticate(username, password) {
  return request({
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
  }).then(data => {
    tokenData = data
    return tokenData
  })
}
