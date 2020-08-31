import {
  createConnection,
  getConnection,
  Connection,
  ConnectionOptions,
} from 'typeorm'
import { JolocomTypeormStorage } from '@jolocom/sdk-storage-typeorm'
import { claimsMetadata } from 'jolocom-lib'
import { InternalDb } from 'local-resolver-registrar/js/db'
import { JolocomSDK, NaivePasswordStore } from '../'
import { getConnectionConfig } from './util'

const conn1Name = 'share1'
const conn2Name = 'share2'

const testConnection1 = getConnectionConfig(conn1Name) as ConnectionOptions
const testConnection2 = getConnectionConfig(conn2Name) as ConnectionOptions

const getSdk = (connection: Connection, eDB?: InternalDb) =>
  new JolocomSDK({
    passwordStore: new NaivePasswordStore(),
    storage: new JolocomTypeormStorage(connection),
    eventDB: eDB,
  })

beforeEach(async () => {
  await createConnection(testConnection1)
  await createConnection(testConnection2)
})

afterEach(async () => {
  let conn1 = getConnection(conn1Name)
  await conn1.close()
  let conn2 = getConnection(conn2Name)
  return conn2.close()
})

test('Credential Request interaction', async () => {
  const aliceCon = getConnection(conn1Name)
  const bobCon = getConnection(conn2Name)

  const alice = getSdk(aliceCon)
  alice.didMethods.setDefault(alice.didMethods.get('jun'))
  await alice.init()

  const bob = getSdk(bobCon)
  bob.didMethods.setDefault(bob.didMethods.get('jun'))
  await bob.createNewIdentity()

  // making them mutually resolvable
  const aliceId = alice.idw.did.split(':')[2]
  const aliceEL = await alice.storageLib.eventDB.read(aliceId)

  const bobId = bob.idw.did.split(':')[2]
  const bobEL = await bob.storageLib.eventDB.read(bobId)

  await alice.didMethods.getDefault().registrar.encounter(bobEL)
  await bob.didMethods.getDefault().registrar.encounter(aliceEL)

  // ensure bob is resolvable by alice
  expect(alice.resolve(bob.idw.did)).resolves.toMatchObject(
    Promise.resolve(bob.idw.didDocument.toJSON()),
  )

  // ensure alice is resolvable by bob
  expect(bob.resolve(alice.idw.did)).resolves.toMatchObject(
    Promise.resolve(alice.idw.didDocument.toJSON()),
  )

  // Bob self-issues a name credential
  const bobSelfSignedCred = await bob.signedCredential({
    metadata: claimsMetadata.name,
    subject: bob.idw.did,
    claim: {
      givenName: 'Bob',
      familyName: 'Agent',
    },
  })

  await bob.storageLib.store.verifiableCredential(bobSelfSignedCred)

  const aliceCredReq = await alice.credRequestToken({
    callbackURL: 'nowhere',
    credentialRequirements: [
      { type: ['ProofOfNameCredential'], constraints: [] },
    ],
  })

  const bobInteraction = await bob.processJWT(aliceCredReq)

  const bobResponse = (
    await bobInteraction.createCredentialResponse([bobSelfSignedCred.id])
  ).encode()
  await bob.processJWT(bobResponse)

  const aliceInteraction = await alice.processJWT(bobResponse)

  expect(
    // @ts-ignore
    aliceInteraction.getSummary().state.providedCredentials[0]
      .suppliedCredentials,
  ).toHaveLength(1)
})