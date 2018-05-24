jest.mock('cozy-konnector-libs', () => {
  return {
    requestFactory: () => jest.fn(),
    log: jest.fn()
  }
})

const lib = require('./lib')
const log = require('cozy-konnector-libs').log

beforeEach(() => {
  lib.authenticate = jest.fn()
  log.mockReset()
})

describe('authentication', () => {
  it('start should log LOGIN_FAILED if authentication fails', async () => {
    lib.authenticate.mockImplementation(() => {
      throw {
        response: {
          error_description: 'IncorrectUsernameOrPassword'
        }
      }
    })
    const fields = {}
    await lib.start(fields)
    expect(log).toHaveBeenLastCalledWith('critical', 'LOGIN_FAILED')
  })

  it('start should log UNKNOWN_ERROR if authentication fails for an unknown reason', async () => {
    lib.authenticate.mockImplementation(() => {
      throw {
        response: {
          error_description: 'DontKnowWhatHappened'
        }
      }
    })
    const fields = {}
    await lib.start(fields)
    expect(log).toHaveBeenLastCalledWith('critical', 'UNKNOWN_ERROR')
  })
})

describe('parking session to bill', () => {
  it('should correctly transform', () => {
    const parkingSession = {
      totalCost: {
        amount: 12
      },
      startTime: '2018-05-24T10:31:01.140Z',
      expireTime: '2018-05-24T11:01:01.760Z',
      locationId: '60200',
      vehicle: {
        licensePlate: 'XY-DEADBEEF-12'
      }
    }
    expect(lib.billFromParkingSession(parkingSession)).toEqual({
      amount: 12,
      date: '2018-05-24T10:31:01.140Z',
      expireTime: '2018-05-24T11:01:01.760Z',
      location: '60200',
      metadata: {
        version: 1
      },
      startTime: '2018-05-24T10:31:01.140Z',
      subtype: 'Parking pour XY-DEADBEEF-12',
      type: 'parking',
      vehicle: 'XY-DEADBEEF-12',
      vendor: 'PayByPhone'
    })
  })
})

describe('authorized request', () => {
  it('should launch request with the correct headers', () => {
    lib.setTokenData({
      access_token: 'FAKE_TOKEN'
    })
    lib.authorizedRequest({})
    expect(lib.request).toHaveBeenLastCalledWith({
      headers: { Authorization: 'bearer FAKE_TOKEN', 'x-pbp-version': 2 }
    })
  })
})
