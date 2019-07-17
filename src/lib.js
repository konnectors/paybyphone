const {
  requestFactory,
  log,
  saveBills,
  createCozyPDFDocument,
  htmlToPDF
} = require('cozy-konnector-libs')
const merge = require('lodash/merge')
const { jar } = require('request')
const querystring = require('querystring')

const j = jar()
const cheerio = require('cheerio')
const moment = require('moment')
moment.locale('fr')

const request = requestFactory({
  // debug: true,
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
  // We know many people use mail as login, it's not possible in all way known to us.
  //   (.fr, .com)
  // We chose here to not even execute the login
  // A warning is added in description
  if (fields.login.includes('@')) {
    log('error', 'Login contains a @, connector exit before authentification')
    throw 'LOGIN_FAILED'
  }
  try {
    await lib.authenticate(fields.login, fields.password)
  } catch (e) {
    log('error', e)
    log('critical', translateError(e))
    return
  }
  log('info', 'Successfully logged in')
  // The BaseKonnector instance expects a Promise as return of the function
  log('info', 'Fetching the list of parking sessions')
  const parkingSessions = await lib.fetchParkingSessions()
  const bills = []
  log('info', `Generating PDF for each ${parkingSessions.length}sessions`)
  for (const session of parkingSessions) {
    const bill = await lib.billFromParkingSession(session)
    bills.push(bill)
  }
  await saveBills(bills, fields.folderPath, {
    // PayByPhone puts the name of the town as the label of the banking operation so
    // it changes everytime
    identifiers: [''],
    contentType: 'application/pdf'
  })
}

lib.fetchParkingSessions = async () => {
  let sessions = []
  // We select only the first account there
  const accounts = await lib.authorizedRequest({
    uri: `${baseUrl}parking/accounts/`
  })
  accountId = accounts[0].id
  // Aggregate all possible result 10 by 10 (as it seems to be the max request)
  let moreSessions = true
  let offset = 0
  while (moreSessions === true) {
    const tempSessions = await lib.authorizedRequest({
      uri: `${baseUrl}parking/accounts/${accountId}/sessions?limit=10&offset=${offset}&order=DESC&periodType=Historic`
    })
    sessions = sessions.concat(tempSessions)
    offset += 10
    if (tempSessions.length < 10) {
      // Stop loop
      moreSessions = false
    }
  }
  return sessions
}

lib.billFromParkingSession = async parkingSession => {
  // Gather info about location
  const location = await lib.authorizedRequest({
    uri: `${baseUrl}parking/locations/${parkingSession.locationId}`
  })
  // Generating an html with infos
  const html = `<body>
<h5>Paybyphone</h5>
<p><b>&nbsp\nRésumé de stationnement</b></p>
<p>${location.name}</p>
<p>${location.vendorName}
<p>&nbsp\nDépart : ${moment(parkingSession.startTime).format('LLL')}</p>
<p>Expiration : ${moment(parkingSession.expireTime).format('LLL')}</p>
<p>Code tarif/zone : ${parkingSession.locationId}</p>
<p>
<p>Immatriculation : ${parkingSession.vehicle.licensePlate}</p>
<p><b>Montant total : ${parkingSession.totalCost.amount} ${
    parkingSession.totalCost.currency
  }</b>(frais de service compris)</p>
<p>&nbsp\n&nbsp\nGénéré par Cozy depuis le site https://paybyphone.com</p>
</body>`
  const $ = cheerio.load(html)
  // Generating a PDF with this html
  const pdf = createCozyPDFDocument('', '')
  htmlToPDF($, pdf, $('body'), { baseUrl: '' })
  pdf.end()
  const date = new Date(parkingSession.startTime)
  return {
    amount: parkingSession.totalCost.amount,
    date,
    filestream: pdf,
    filename:
      `${moment(date).format('YYYY-MM-DD')}_Paybyphone_${
        parkingSession.totalCost.amount
      }` + `${parkingSession.totalCost.currency}_${location.vendorName}.pdf`,
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
  }
}

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
